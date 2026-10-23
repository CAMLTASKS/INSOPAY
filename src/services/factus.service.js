const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/factus.config');

class FactusService {
  constructor() {
    this.cachedToken = null;
    this.tokenTimestamp = 0;
    // Renovar token cada 12 horas por seguridad
    this.tokenTTL = 12 * 60 * 60 * 1000;
    // Almacén en memoria de webhooks recibidos (últimos 50)
    this.webhookLogs = [];
    // Set de referencias ya procesadas para garantizar idempotencia
    this.processedReferences = new Set();
    // Cache de estado en memoria por código de referencia para sincronización en tiempo real
    this.collectionsState = new Map();
    // Clientes SSE (Server-Sent Events) conectados para actualizaciones en tiempo real
    this.sseClients = new Set();
  }

  /**
   * Suscribir un cliente al stream de eventos en tiempo real (Server-Sent Events)
   */
  addSseClient(res) {
    this.sseClients.add(res);
  }

  /**
   * Remover un cliente desconectado
   */
  removeSseClient(res) {
    this.sseClients.delete(res);
  }

  /**
   * Emitir evento en tiempo real a todos los navegadores conectados (0 ms de latencia)
   */
  broadcastEvent(eventName, data) {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch (e) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Obtener token de autenticación Bearer para Factus Pay (POST /auth)
   */
  async getAuthToken(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedToken && (now - this.tokenTimestamp < this.tokenTTL)) {
      return this.cachedToken;
    }

    try {
      console.log(`[FactusService] Autenticando en Factus Pay (${config.getAuthUrl()}) con ${config.email}...`);
      const response = await axios.post(config.getAuthUrl(), {
        email: config.email,
        password: config.password
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const token = response.data?.token || response.data?.data?.token;
      if (!token) {
        throw new Error('Factus Pay no retornó un token de acceso válido en la respuesta');
      }

      this.cachedToken = token;
      this.tokenTimestamp = now;
      console.log(`[FactusService] Token de autenticación obtenido exitosamente.`);
      return this.cachedToken;
    } catch (error) {
      this.cachedToken = null;
      const errorMsg = error.response?.data?.message || error.message;
      console.error('[FactusService] Error de autenticación en Factus Pay:', errorMsg);
      const customError = new Error(`Error autenticando en Factus Pay: ${errorMsg}`);
      customError.status = error.response?.status || 401;
      customError.details = error.response?.data;
      throw customError;
    }
  }

  /**
   * Probar conectividad con Factus Pay y medir latencia
   */
  async testConnection() {
    const start = Date.now();
    try {
      const token = await this.getAuthToken(true);
      const latencyMs = Date.now() - start;
      return {
        success: true,
        provider: 'factus_pay',
        environment: config.isProduction ? 'production' : 'sandbox',
        baseUrl: config.baseUrl,
        email: config.email,
        latencyMs,
        tokenAvailable: !!token,
        tokenTimestamp: new Date(this.tokenTimestamp).toISOString(),
        webhookKeyConfigured: !!config.webhookKey,
        webhookUrl: config.getWebhookUrl(),
        message: 'Conexión con Factus Pay verificada y operativa'
      };
    } catch (error) {
      return {
        success: false,
        provider: 'factus_pay',
        environment: config.isProduction ? 'production' : 'sandbox',
        error: error.message,
        latencyMs: Date.now() - start
      };
    }
  }

  /**
   * Crear un nuevo recaudo con Factus Pay y generar su código QR (POST /v1/collections)
   */
  async createCollection({ amount, reference_code, description }) {
    const cleanAmount = Math.round(Number(amount));
    if (isNaN(cleanAmount) || cleanAmount < config.minAmount || cleanAmount > config.maxAmount) {
      throw new Error(`El monto debe ser un entero entre $${config.minAmount.toLocaleString('es-CO')} y $${config.maxAmount.toLocaleString('es-CO')} COP`);
    }

    const refCode = reference_code || `FACTUS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const token = await this.getAuthToken();

    try {
      console.log(`[FactusService] Creando recaudo ${refCode} por $${cleanAmount} COP...`);
      const response = await axios.post(config.getCollectionsUrl(), {
        reference_code: refCode,
        amount: cleanAmount
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 15000
      });

      let collectionData = response.data?.data || response.data;

      // Si el QR viene null en la respuesta de creación, consultamos el detalle
      if (!collectionData.qr) {
        console.log(`[FactusService] Consultando detalle para obtener el QR completo de ${refCode}...`);
        const detail = await this.getCollection(refCode);
        collectionData = detail.data || collectionData;
      }

      const fullData = {
        ...collectionData,
        description: description || `Recaudo Factus Pay - Ref: ${refCode}`,
        currency: 'COP',
        qr_image: collectionData.qr,
        breb_key: collectionData.breb_key,
        status: collectionData.status || 'ready'
      };

      // Guardar en cache local para sincronización inmediata
      this.collectionsState.set(refCode, fullData);

      // Notificar a navegadores conectados
      this.broadcastEvent('collection_created', fullData);

      return {
        success: true,
        provider: 'factus_pay',
        environment: config.isProduction ? 'production' : 'sandbox',
        message: response.data?.message || 'Recaudo creado y QR generado correctamente',
        data: fullData
      };
    } catch (error) {
      if (error.response?.status === 401) {
        console.warn('[FactusService] Token expirado, renovando y reintentando...');
        const newToken = await this.getAuthToken(true);
        const retryRes = await axios.post(config.getCollectionsUrl(), {
          reference_code: refCode,
          amount: cleanAmount
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${newToken}`
          }
        });
        const retryData = retryRes.data?.data || retryRes.data;
        this.collectionsState.set(refCode, retryData);
        return {
          success: true,
          provider: 'factus_pay',
          environment: config.isProduction ? 'production' : 'sandbox',
          message: retryRes.data?.message || 'Recaudo creado correctamente',
          data: retryData
        };
      }

      const errorMsg = error.response?.data?.message || error.message;
      console.error('[FactusService] Error creando recaudo en Factus Pay:', error.response?.data || errorMsg);
      const customError = new Error(errorMsg);
      customError.status = error.response?.status || 500;
      customError.details = error.response?.data;
      throw customError;
    }
  }

  /**
   * Consultar estado y detalle de un recaudo por su reference_code (GET /v1/collections/:referenceCode)
   * Combina la consulta con el estado local recibido por webhook o escaneo
   */
  async getCollection(referenceCode) {
    if (!referenceCode) {
      throw new Error('El código de referencia (referenceCode) es requerido');
    }

    const token = await this.getAuthToken();
    let apiData = null;

    try {
      const url = config.getCollectionDetailUrl(referenceCode);
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      });

      apiData = response.data?.data || response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        const newToken = await this.getAuthToken(true);
        const retryRes = await axios.get(config.getCollectionDetailUrl(referenceCode), {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${newToken}`
          }
        });
        apiData = retryRes.data?.data || retryRes.data;
      } else {
        console.warn(`[FactusService] Factus API error consultando ${referenceCode}:`, error.message);
      }
    }

    // Combinar con el estado local más reciente
    const localData = this.collectionsState.get(referenceCode) || {};
    
    // Si la API devolvió datos, consolidamos
    let consolidated = { ...localData, ...(apiData || {}) };

    // Si localmente tenemos 'paid' o 'started' (por ejemplo por webhook o escaneo),
    // preservamos ese estado si la API aún marca 'ready'
    if (localData.status && (localData.status === 'paid' || localData.status === 'started')) {
      if (!apiData || apiData.status === 'ready') {
        consolidated.status = localData.status;
      }
    }

    if (localData.payer && !consolidated.payer) {
      consolidated.payer = localData.payer;
    }

    // Actualizar cache local
    this.collectionsState.set(referenceCode, consolidated);

    return {
      success: true,
      provider: 'factus_pay',
      data: consolidated,
      message: 'Recaudo consultado correctamente'
    };
  }

  /**
   * Marcar manualmente o detectar que el código QR fue escaneado por el pagador (estado: started)
   * @param {string} referenceCode 
   */
  markAsScanned(referenceCode) {
    const existing = this.collectionsState.get(referenceCode) || { reference_code: referenceCode };
    
    // Solo pasamos a started si aún estaba en ready
    if (existing.status !== 'paid') {
      existing.status = 'started';
      existing.scanned_at = new Date().toISOString();
      this.collectionsState.set(referenceCode, existing);

      console.log(`📱 [FactusService] ¡Código QR escaneado para el recaudo ${referenceCode}! Estado -> started`);

      // Emitir en tiempo real a la interfaz
      this.broadcastEvent('qr_scanned', {
        reference_code: referenceCode,
        status: 'started',
        message: '¡El código QR fue escaneado por el cliente desde su aplicación bancaria!',
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      reference_code: referenceCode,
      status: existing.status,
      message: 'Recaudo actualizado a estado started (escaneado)'
    };
  }

  /**
   * Listar recaudos paginados (GET /v1/collections)
   */
  async listCollections(filters = {}) {
    if (typeof filters === 'number') {
      filters = { page: filters };
    }

    const token = await this.getAuthToken();

    const cleanParams = {};
    if (filters.page) cleanParams.page = filters.page;
    if (filters.status && filters.status !== 'all') cleanParams.status = filters.status;
    if (filters.reference_code) cleanParams.reference_code = filters.reference_code;

    try {
      const response = await axios.get(config.getCollectionsUrl(), {
        params: cleanParams,
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 12000
      });

      let items = response.data?.data || [];
      // Sincronizar estados locales con los items devueltos
      items = items.map(item => {
        const local = this.collectionsState.get(item.reference_code);
        if (local && (local.status === 'paid' || local.status === 'started')) {
          return { ...item, status: local.status, payer: local.payer || item.payer };
        }
        return item;
      });

      return {
        success: true,
        provider: 'factus_pay',
        ...response.data,
        data: items
      };
    } catch (error) {
      if (error.response?.status === 401) {
        const newToken = await this.getAuthToken(true);
        const retryRes = await axios.get(config.getCollectionsUrl(), {
          params: cleanParams,
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${newToken}`
          }
        });
        return {
          success: true,
          provider: 'factus_pay',
          ...retryRes.data
        };
      }

      const errorMsg = error.response?.data?.message || error.message;
      const customError = new Error(errorMsg);
      customError.status = error.response?.status || 500;
      customError.details = error.response?.data;
      throw customError;
    }
  }

  /**
   * Validar que la llave secreta del webhook coincida mediante comparación en tiempo constante (timingSafeEqual)
   */
  validateWebhookKey(providedKey) {
    if (!providedKey || typeof providedKey !== 'string') {
      return false;
    }

    const expectedKey = config.webhookKey;
    if (!expectedKey) {
      return true;
    }

    const bufProvided = Buffer.from(providedKey);
    const bufExpected = Buffer.from(expectedKey);

    if (bufProvided.length !== bufExpected.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufProvided, bufExpected);
  }

  /**
   * Procesar una notificación de webhook oficial de Factus Pay
   * Valida la llave, garantiza idempotencia, almacena payer, actualiza estado y notifica vía SSE en 0ms
   */
  async processIncomingWebhook(providedKey, payload) {
    // 1. Validar la llave de autenticación
    const isKeyValid = this.validateWebhookKey(providedKey);
    if (!isKeyValid) {
      console.warn('❌ [FactusPay Webhook] Intento de acceso no autorizado con llave inválida:', providedKey);
      return {
        success: false,
        statusCode: 401,
        responseBody: {
          error: 'Unauthorized',
          message: 'La llave de autenticación (key) no coincide o no fue provista.'
        }
      };
    }

    const colData = payload.data || payload;
    const refCode = colData.reference_code;
    const amount = colData.amount;
    const status = colData.status || 'paid';
    const payer = colData.payer || null;

    // 2. Control de idempotencia
    const isAlreadyProcessed = refCode && this.processedReferences.has(refCode);

    // 3. Registrar en historial de auditoría
    const logEntry = {
      id: `wh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      received_at: new Date().toISOString(),
      event: payload.event || (status === 'paid' ? 'collection.paid' : `collection.${status}`),
      reference_code: refCode || 'N/A',
      amount: amount || null,
      status: status,
      breb_key: colData.breb_key || null,
      payer: payer,
      is_duplicate: isAlreadyProcessed,
      raw_payload: payload
    };

    this.webhookLogs.unshift(logEntry);
    if (this.webhookLogs.length > 50) {
      this.webhookLogs.pop();
    }

    // 4. Actualizar cache local inmediatamente
    if (refCode) {
      const existing = this.collectionsState.get(refCode) || {};
      this.collectionsState.set(refCode, {
        ...existing,
        ...colData,
        status: status,
        payer: payer || existing.payer
      });
      this.processedReferences.add(refCode);
    }

    console.log(`✅ [FactusPay Webhook] Pago recibido correctamente para ref: ${refCode} (Estado: ${status}, Duplicado: ${isAlreadyProcessed})`);
    if (payer) {
      console.log(`👤 [FactusPay Webhook] Pagador: ${payer.name} (${payer.document_type} ${payer.document_number})`);
    }

    // 5. EMISIÓN EN TIEMPO REAL A TODOS LOS CLIENTES CONECTADOS (0 ms)
    this.broadcastEvent('payment_update', {
      reference_code: refCode,
      status: status,
      amount: amount,
      payer: payer,
      is_duplicate: isAlreadyProcessed,
      timestamp: new Date().toISOString()
    });

    // 6. Responder 200 OK en <10s
    return {
      success: true,
      statusCode: 200,
      responseBody: {
        received: true,
        reference_code: refCode,
        status: status,
        already_processed: isAlreadyProcessed,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Obtener historial de webhooks recibidos
   */
  getWebhookLogs() {
    return {
      success: true,
      total: this.webhookLogs.length,
      webhook_key: config.webhookKey,
      webhook_url: config.getWebhookUrl(),
      logs: this.webhookLogs
    };
  }

  /**
   * Limpiar historial de webhooks
   */
  clearWebhookLogs() {
    this.webhookLogs = [];
    this.processedReferences.clear();
    this.collectionsState.clear();
    return { success: true, message: 'Historial de webhooks y cache limpiados' };
  }

  /**
   * Simular un escenario de pago (started, paid, tx_insufficient_funds, tx_account_error, tx_timeout)
   */
  async simulatePayment({ reference_code, scenario = 'paid', amount = 25000 }) {
    if (!reference_code) {
      throw new Error('El código de referencia es requerido para la simulación');
    }

    // Soporte para simular escaneo (started)
    if (scenario === 'started') {
      const scanRes = this.markAsScanned(reference_code);
      return {
        success: true,
        message: 'Simulación ejecutada: El pagador escaneó el código QR con su banco',
        scenario: 'started',
        resulting_status: 'started',
        simulated_payload: {
          data: {
            reference_code,
            status: 'started',
            message: 'Código escaneado en la red Bre-B'
          }
        },
        webhook_processed: scanRes
      };
    }

    const scenarioMap = {
      paid: { status: 'paid', event: 'collection.paid', desc: 'Pago aprobado exitosamente' },
      tx_insufficient_funds: { status: 'rejected', event: 'collection.failed', desc: 'Rechazado: Saldo insuficiente en la cuenta' },
      tx_account_error: { status: 'failed', event: 'collection.failed', desc: 'Fallido: Error en la entidad bancaria o cuenta' },
      tx_timeout: { status: 'failed', event: 'collection.timeout', desc: 'Fallido: Tiempo de espera agotado' }
    };

    const selected = scenarioMap[scenario] || scenarioMap.paid;

    const simulatedWebhook = {
      data: {
        reference_code,
        amount: Number(amount),
        status: selected.status,
        breb_key: `@FC${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        created_at: new Date().toISOString(),
        qr_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payer: selected.status === 'paid' ? {
          name: 'Juan Pérez',
          document_type: 'CC',
          document_number: '1020304050'
        } : null
      }
    };

    // Procesar a través de la lógica oficial con la llave configurada
    const processResult = await this.processIncomingWebhook(config.webhookKey, simulatedWebhook);

    return {
      success: true,
      message: `Simulación ejecutada: ${selected.desc}`,
      scenario,
      resulting_status: selected.status,
      simulated_payload: simulatedWebhook,
      webhook_processed: processResult.responseBody
    };
  }
}

module.exports = new FactusService();
