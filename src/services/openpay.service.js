const axios = require('axios');
const QRCode = require('qrcode');
const os = require('os');
const config = require('../config/openpay.config');

// Almacén en memoria para transacciones de simulación/pruebas
const simulatedChargesStore = new Map();

/**
 * Obtener la IP local de la máquina para que el celular en la misma red Wi-Fi pueda abrir el checkout
 */
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Cálculo del CRC-16 CCITT para el estándar bancario EMVCo
 */
function crc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag, value) {
  const strVal = String(value);
  const len = String(Buffer.byteLength(strVal, 'utf8')).padStart(2, '0');
  return `${tag}${len}${strVal}`;
}

/**
 * Construir cadena con estándar EMVCo Merchant-Presented para Redeban / Colombia
 */
function buildEmvCoColombia({ amount, merchantId, orderId, merchantName = 'OPENPAY COL' }) {
  const f00 = tlv('00', '01'); // Formato EMV
  const f01 = tlv('01', '12'); // QR dinámico
  const redebanSub = tlv('00', 'CO.REDEBAN') + tlv('01', merchantId) + tlv('02', orderId);
  const f26 = tlv('26', redebanSub); // Merchant Account Information
  const f52 = tlv('52', '0000'); // MCC
  const f53 = tlv('53', '170');  // Moneda COP (ISO 4217)
  const f54 = tlv('54', String(Math.round(amount))); // Monto
  const f58 = tlv('58', 'CO');   // País
  const f59 = tlv('59', merchantName.substring(0, 25)); // Nombre comercio
  const f60 = tlv('60', 'BOGOTA'); // Ciudad
  const f62 = tlv('62', tlv('05', orderId.substring(0, 25))); // Referencia orden

  const payloadWithoutCrc = `${f00}${f01}${f26}${f52}${f53}${f54}${f58}${f59}${f60}${f62}6304`;
  const checksum = crc16Ccitt(payloadWithoutCrc);
  return `${payloadWithoutCrc}${checksum}`;
}

/**
 * Diccionario de Entidades Financieras de Colombia (Códigos ACH / Bre-B)
 */
const COLOMBIA_BANKS = {
  'CAJA_SOCIAL': { code: '1032', tag: 'CO.BCS', name: 'Banco Caja Social' },
  'NEQUI': { code: '1507', tag: 'CO.NEQUI', name: 'Nequi' },
  'BANCOLOMBIA': { code: '1007', tag: 'CO.BANCOLOMBIA', name: 'Bancolombia' },
  'DAVIPLATA': { code: '1551', tag: 'CO.DAVIPLATA', name: 'Daviplata' },
  'DAVIVIENDA': { code: '1051', tag: 'CO.DAVIVIENDA', name: 'Davivienda' },
  'BANCO_BOGOTA': { code: '1001', tag: 'CO.BANBOGOTA', name: 'Banco de Bogotá' },
  'BBVA': { code: '1013', tag: 'CO.BBVA', name: 'BBVA Colombia' },
  'COLPATRIA': { code: '1019', tag: 'CO.COLPATRIA', name: 'Scotiabank Colpatria' },
  'AV_VILLAS': { code: '1052', tag: 'CO.AVVILLAS', name: 'Banco AV Villas' },
  'BANCO_OCCIDENTE': { code: '1023', tag: 'CO.OCCIDENTE', name: 'Banco de Occidente' },
  'DALE': { code: '1096', tag: 'CO.DALE', name: 'Dale!' },
  'BRE_B': { code: '0000', tag: 'CO.BRE-B', name: 'Bre-B Interoperable (Todos los bancos)' },
  'REDEBAN': { code: '0000', tag: 'CO.REDEBAN', name: 'Redeban Interoperable' }
};

/**
 * Construir código QR directo a número de celular / cuenta (Caja Social, Nequi, Bancolombia, etc.)
 */
function buildDirectPhoneQr({ phone = '3503752816', amount, name = 'CARLOS MALDONADO', entity = 'CAJA_SOCIAL' }) {
  const f00 = tlv('00', '01');
  const f01 = tlv('01', '12'); // QR dinámico con monto

  const bankInfo = COLOMBIA_BANKS[entity] || COLOMBIA_BANKS['CAJA_SOCIAL'];
  const accountSub = tlv('00', bankInfo.tag) + tlv('01', phone) + tlv('02', bankInfo.code);
  const f26 = tlv('26', accountSub);

  const f52 = tlv('52', '0000');
  const f53 = tlv('53', '170'); // COP
  const f54 = tlv('54', String(Math.round(amount)));
  const f58 = tlv('58', 'CO');
  const f59 = tlv('59', name.substring(0, 25).toUpperCase());
  const f60 = tlv('60', 'BOGOTA');

  const additionalSub = tlv('02', phone) + tlv('05', 'PAGO-' + Date.now().toString().slice(-6));
  const f62 = tlv('62', additionalSub);

  const payloadWithoutCrc = `${f00}${f01}${f26}${f52}${f53}${f54}${f58}${f59}${f60}${f62}6304`;
  const checksum = crc16Ccitt(payloadWithoutCrc);
  return `${payloadWithoutCrc}${checksum}`;
}

class OpenpayService {
  constructor() {
    this.http = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': config.getAuthHeader()
      },
      timeout: 15000
    });
  }

  /**
   * Generar cargo QR con Openpay Colombia
   * @param {Object} params
   * @param {string} [params.qr_format] - 'emv' (Bancario Redeban), 'webcheckout' (Oficial Openpay), 'url' (Local)
   */
  async createQrCharge({ amount, description, order_id, customer, qr_format = 'emv' }) {
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new Error('El monto (amount) es requerido, debe ser numérico entero mayor a 0 sin decimales');
    }
    const cleanAmount = Math.round(Number(amount));

    if (!customer || !customer.name || !customer.email) {
      throw new Error('El objeto customer es requerido y debe contener al menos "name" y "email" válidos');
    }

    const uniqueOrderId = order_id || `ORD-QR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const rawDescription = description || `Cobro de pedido ${cleanAmount} COP`;
    // Sanitizar descripción para evitar rechazos de Openpay (no permite símbolos como $ o caracteres especiales)
    const cleanDescription = rawDescription.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\-_.]/g, '').trim() || 'Cobro de servicio';

    // Si el usuario eligió Modo Webcheckout Oficial de Openpay
    if (qr_format === 'webcheckout') {
      return await this._createOpenpayWebcheckoutQr({
        amount: cleanAmount,
        description: cleanDescription,
        order_id: uniqueOrderId,
        customer
      });
    }

    // Si el usuario eligió Modo Directo a Celular (Nequi / Bancolombia al 3503752816 sin Openpay)
    if (qr_format === 'direct_phone') {
      return await this._createDirectPhoneQr({
        phone: customer.destination_phone || '3503752816',
        entity: customer.destination_entity || 'NEQUI',
        amount: cleanAmount,
        description: cleanDescription,
        order_id: uniqueOrderId,
        customer
      });
    }

    // Modo Cargo QR directo con Openpay (Redeban)
    const requestPayload = {
      method: 'qr',
      currency: config.defaultCurrency,
      amount: cleanAmount,
      description: cleanDescription,
      order_id: uniqueOrderId,
      customer: {
        name: customer.name.trim(),
        last_name: (customer.last_name || '').trim(),
        email: customer.email.trim(),
        phone_number: (customer.phone_number || '3001234567').trim()
      }
    };

    const endpointUrl = `/${config.merchantId}/charges`;

    try {
      console.log(`[OpenpayService] Enviando petición QR a Openpay: ${config.baseUrl}${endpointUrl}`);
      const response = await this.http.post(endpointUrl, requestPayload);

      console.log(`[OpenpayService] Cargo QR creado exitosamente en Openpay: ${response.data.id}`);

      const creationDate = new Date(response.data.creation_date || Date.now());
      const expirationDate = new Date(creationDate.getTime() + 10 * 60 * 1000);

      return {
        success: true,
        is_simulation: false,
        data: {
          ...response.data,
          timer: {
            duration_minutes: 10,
            expires_at: expirationDate.toISOString(),
            expires_in_seconds: 600,
            must_refresh: true
          }
        }
      };
    } catch (error) {
      const errorData = error.response ? error.response.data : null;
      const status = error.response ? error.response.status : 500;

      console.warn(`[OpenpayService] Error en Openpay API (HTTP ${status}):`, errorData || error.message);

      const isQrParamMissing = errorData && 
        (errorData.error_code === 1003 || errorData.http_code === 422) && 
        (errorData.description || '').toLowerCase().includes('comercio qr');

      if (isQrParamMissing && config.enableFallbackSimulation) {
        console.info('[OpenpayService] Activando generación de QR con simulación sandbox...');
        return await this._generateSimulatedQrResponse(requestPayload, errorData, qr_format);
      }

      const customError = new Error(errorData?.description || error.message);
      customError.status = status;
      customError.openpayError = errorData;
      throw customError;
    }
  }

  /**
   * Crear código QR directo a celular (Nequi / Bancolombia / Bre-B)
   * Envía el pago directamente al celular 3503752816 sin pasar por Openpay
   */
  async _createDirectPhoneQr({ phone = '3503752816', entity = 'NEQUI', amount, description, order_id, customer }) {
    console.log(`[OpenpayService] Generando QR directo a celular ${phone} (${entity}) por $${amount} COP (Sin Openpay)...`);

    const emvString = buildDirectPhoneQr({
      phone,
      amount,
      name: `${customer.name || ''} ${customer.last_name || ''}`.trim() || 'CARLOS MALDONADO',
      entity
    });

    const dataUrl = await QRCode.toDataURL(emvString, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#002663', light: '#ffffff' }
    });
    const base64Only = dataUrl.replace(/^data:image\/png;base64,/, '');

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const transactionId = `direct_${Date.now()}`;

    const result = {
      id: transactionId,
      authorization: null,
      operation_type: 'in',
      transaction_type: 'direct_phone_transfer',
      status: 'charge_pending',
      conciliated: false,
      creation_date: now.toISOString(),
      operation_date: now.toISOString(),
      description: `${description} (Directo a ${phone})`,
      error_message: null,
      order_id,
      gateway_card_present: `DIRECT_${entity}`,
      destination_phone: phone,
      destination_entity: entity,
      amount,
      customer,
      payment_method: {
        type: 'qr',
        barcode_base64: base64Only,
        qr_type: 'dynamic',
        encoded_content: emvString,
        format_type: `direct_${entity.toLowerCase()}_emvco`,
        destination_phone: phone
      },
      currency: 'COP',
      method: 'direct_qr',
      timer: {
        duration_minutes: 10,
        expires_at: expiresAt.toISOString(),
        expires_in_seconds: 600,
        must_refresh: true
      },
      notice: {
        is_direct: true,
        destination_phone: phone,
        message: `El pago va directo a tu cuenta de ${entity} (${phone}) sin comisiones ni intermediación de Openpay.`
      }
    };

    simulatedChargesStore.set(transactionId, result);

    return {
      success: true,
      is_direct: true,
      is_simulation: false,
      data: result
    };
  }

  /**
   * Crear código QR a partir del Webcheckout OFICIAL de Openpay
   * POST /v1/{MERCHANT_ID}/checkouts
   */
  async _createOpenpayWebcheckoutQr({ amount, description, order_id, customer }) {
    const payload = {
      amount,
      iva: '0',
      description,
      currency: config.defaultCurrency,
      order_id,
      redirect_url: 'https://sandbox-dashboard.openpay.co',
      customer: {
        name: customer.name.trim(),
        last_name: (customer.last_name || 'General').trim(),
        email: customer.email.trim(),
        phone_number: (customer.phone_number || '3001234567').trim()
      }
    };

    console.log(`[OpenpayService] Creando Webcheckout oficial en Openpay Sandbox... Payload:`, JSON.stringify(payload));
    try {
      const response = await this.http.post(`/${config.merchantId}/checkouts`, payload);
      const checkoutData = response.data;

      const dataUrl = await QRCode.toDataURL(checkoutData.checkout_link, {
        width: 400,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#002663', light: '#ffffff' }
      });
      const base64Only = dataUrl.replace(/^data:image\/png;base64,/, '');

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      const result = {
        id: checkoutData.id,
        authorization: null,
        operation_type: 'in',
        transaction_type: 'webcheckout',
        status: 'charge_pending',
        conciliated: false,
        creation_date: checkoutData.creation_date || now.toISOString(),
        operation_date: now.toISOString(),
        description: checkoutData.description,
        error_message: null,
        order_id: checkoutData.order_id,
        gateway_card_present: 'OPENPAY_WEBCHECKOUT',
        amount: checkoutData.amount,
        customer: checkoutData.customer,
        payment_method: {
          type: 'qr',
          barcode_base64: base64Only,
          qr_type: 'dynamic',
          encoded_content: checkoutData.checkout_link,
          format_type: 'openpay_official_webcheckout',
          mobile_pay_url: checkoutData.checkout_link
        },
        currency: checkoutData.currency,
        method: 'webcheckout_qr',
        timer: {
          duration_minutes: 10,
          expires_at: expiresAt.toISOString(),
          expires_in_seconds: 600,
          must_refresh: true
        }
      };

      simulatedChargesStore.set(checkoutData.id, result);

      return {
        success: true,
        is_simulation: false,
        is_openpay_official: true,
        data: result
      };
    } catch (error) {
      console.error('[OpenpayService] Error en Webcheckout Openpay:', error.response?.data || error.message);
      const customError = new Error(error.response?.data?.description || error.message);
      customError.status = error.response?.status || 500;
      customError.openpayError = error.response?.data;
      throw customError;
    }
  }

  /**
   * Consultar estado de una transacción QR
   */
  async getChargeStatus(transactionId) {
    if (!transactionId) {
      throw new Error('El ID de transacción es requerido');
    }

    if (simulatedChargesStore.has(transactionId)) {
      const simulated = simulatedChargesStore.get(transactionId);
      
      const now = Date.now();
      const expiresAtMs = new Date(simulated.timer?.expires_at || Date.now() + 600000).getTime();
      if (simulated.status === 'charge_pending' && now > expiresAtMs) {
        simulated.status = 'cancelled';
        simulated.error_message = 'Transacción expirada: se cumplieron los 10 minutos reglamentarios sin pago';
      }

      const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - now) / 1000));
      if (!simulated.timer) simulated.timer = {};
      simulated.timer.remaining_seconds = remainingSeconds;

      return {
        success: true,
        is_simulation: !!simulated.simulation_notice,
        data: simulated
      };
    }

    // Si tiene prefijo trsim_ pero el servidor se reinició:
    if (transactionId.startsWith('trsim_')) {
      const fallbackCharge = {
        id: transactionId,
        status: 'charge_pending',
        amount: 25000,
        currency: 'COP',
        description: 'Transacción en curso',
        timer: {
          duration_minutes: 10,
          expires_at: new Date(Date.now() + 600000).toISOString(),
          expires_in_seconds: 600,
          remaining_seconds: 550,
          must_refresh: true
        }
      };
      simulatedChargesStore.set(transactionId, fallbackCharge);
      return { success: true, is_simulation: true, data: fallbackCharge };
    }

    try {
      const endpointUrl = `/${config.merchantId}/charges/${transactionId}`;
      const response = await this.http.get(endpointUrl);
      return {
        success: true,
        is_simulation: false,
        data: response.data
      };
    } catch (error) {
      const errorData = error.response ? error.response.data : null;
      const status = error.response ? error.response.status : 500;

      // Si Openpay Sandbox responde "The operation is not available yet", significa que el cargo aún está en proceso
      if (errorData && (errorData.description || '').includes('not available yet')) {
        return {
          success: true,
          is_simulation: false,
          data: {
            id: transactionId,
            status: 'charge_pending',
            message: 'Transacción pendiente de procesamiento en Openpay Sandbox'
          }
        };
      }

      const customError = new Error(errorData?.description || error.message);
      customError.status = status;
      customError.openpayError = errorData;
      throw customError;
    }
  }

  /**
   * Obtener una transacción simulada por ID
   */
  getSimulatedCharge(transactionId) {
    return simulatedChargesStore.get(transactionId) || null;
  }

  /**
   * Simular cambio de estado (completed, failed, cancelled)
   */
  simulatePayment(transactionId, status = 'completed', reason = null) {
    if (!simulatedChargesStore.has(transactionId)) {
      return { success: false, message: 'Transacción no encontrada' };
    }
    const charge = simulatedChargesStore.get(transactionId);

    if (status === 'completed') {
      charge.status = 'completed';
      charge.conciliated = true;
      charge.authorization = 'AUTH-' + Math.floor(100000000 + Math.random() * 900000000);
      charge.operation_date = new Date().toISOString();
      charge.error_message = null;
    } else if (status === 'failed') {
      charge.status = 'failed';
      charge.conciliated = false;
      charge.error_message = reason || 'Transacción rechazada por el banco (fondos insuficientes o límite excedido)';
      charge.operation_date = new Date().toISOString();
    } else if (status === 'cancelled') {
      charge.status = 'cancelled';
      charge.conciliated = false;
      charge.error_message = reason || 'Transacción expirada: superó los 10 minutos reglamentarios';
      charge.operation_date = new Date().toISOString();
    }

    return { success: true, data: charge };
  }

  /**
   * Genera un código QR simulado con código de barras en Base64
   */
  async _generateSimulatedQrResponse(requestPayload, openpayError, qrFormat = 'emv') {
    const transactionId = `trsim_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    const localIp = getLocalIp();
    const mobilePaymentUrl = `http://${localIp}:${config.port}/pay/${transactionId}`;

    let qrDataToEncode = '';
    let qrFormatType = '';

    if (qrFormat === 'emv') {
      // Estándar EMVCo Redeban Colombia
      qrDataToEncode = buildEmvCoColombia({
        amount: requestPayload.amount,
        merchantId: config.merchantId,
        orderId: requestPayload.order_id,
        merchantName: 'OPENPAY COLOMBIA'
      });
      qrFormatType = 'emvco_redeban';
    } else {
      // URL de Checkout Móvil
      qrDataToEncode = mobilePaymentUrl;
      qrFormatType = 'mobile_checkout_url';
    }

    // Generar imagen QR en Base64 PNG
    const dataUrl = await QRCode.toDataURL(qrDataToEncode, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#002663',
        light: '#ffffff'
      }
    });

    const base64Only = dataUrl.replace(/^data:image\/png;base64,/, '');

    const simulatedResponse = {
      id: transactionId,
      authorization: null,
      operation_type: 'in',
      transaction_type: 'charge',
      status: 'charge_pending',
      conciliated: false,
      creation_date: now.toISOString(),
      operation_date: now.toISOString(),
      description: requestPayload.description,
      error_message: null,
      order_id: requestPayload.order_id,
      gateway_card_present: 'REDEBAN',
      origin_channel: 'api',
      amount: requestPayload.amount,
      customer: {
        name: requestPayload.customer.name,
        last_name: requestPayload.customer.last_name,
        email: requestPayload.customer.email,
        phone_number: requestPayload.customer.phone_number,
        address: null,
        creation_date: now.toISOString(),
        external_id: null,
        clabe: null
      },
      payment_method: {
        type: 'qr',
        barcode_base64: base64Only,
        qr_type: 'dynamic',
        encoded_content: qrDataToEncode,
        format_type: qrFormatType,
        mobile_pay_url: mobilePaymentUrl
      },
      currency: requestPayload.currency,
      method: 'qr',
      timer: {
        duration_minutes: 10,
        expires_at: expiresAt.toISOString(),
        expires_in_seconds: 600,
        must_refresh: true
      },
      simulation_notice: {
        is_simulation: true,
        reason: openpayError?.description || 'El comercio no tiene configurado el parametro de comercio QR en Openpay',
        instructions: 'Las credenciales de Openpay son válidas. Para recibir pagos reales en Sandbox o Producción, solicita a soporte de Openpay (soporte@openpay.co) activar el parámetro de "Comercio QR" para el merchant ID.'
      }
    };

    simulatedChargesStore.set(transactionId, simulatedResponse);

    return {
      success: true,
      is_simulation: true,
      data: simulatedResponse
    };
  }
}

module.exports = new OpenpayService();
