const factusService = require('../services/factus.service');
const config = require('../config/factus.config');

class FactusController {
  /**
   * Generar nuevo recaudo y código QR con Factus Pay
   * POST /api/factus/generate
   */
  async generateQr(req, res) {
    try {
      const { amount, reference_code, description } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'El campo "amount" (monto a cobrar) es requerido'
        });
      }

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < config.minAmount || numAmount > config.maxAmount) {
        return res.status(400).json({
          success: false,
          error: `El monto debe estar entre $${config.minAmount.toLocaleString('es-CO')} y $${config.maxAmount.toLocaleString('es-CO')} COP`
        });
      }

      const result = await factusService.createCollection({
        amount: numAmount,
        reference_code,
        description
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error('[FactusController.generateQr] Error:', error.message);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message,
        details: error.details || null
      });
    }
  }

  /**
   * Consultar estado de un recaudo por referenceCode
   * GET /api/factus/status/:referenceCode
   */
  async getStatus(req, res) {
    try {
      const { referenceCode } = req.params;
      if (!referenceCode) {
        return res.status(400).json({
          success: false,
          error: 'El parámetro referenceCode es requerido'
        });
      }

      const result = await factusService.getCollection(referenceCode);
      return res.json(result);
    } catch (error) {
      console.error('[FactusController.getStatus] Error:', error.message);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message,
        details: error.details || null
      });
    }
  }

  /**
   * Listar recaudos registrados
   * GET /api/factus/collections
   */
  async listCollections(req, res) {
    try {
      const filters = {
        status: req.query.status,
        reference_code: req.query.reference_code,
        page: req.query.page ? parseInt(req.query.page, 10) : 1
      };
      const result = await factusService.listCollections(filters);
      return res.json(result);
    } catch (error) {
      console.error('[FactusController.listCollections] Error:', error.message);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message,
        details: error.details || null
      });
    }
  }

  /**
   * Probar conectividad y latencia con Factus Pay
   * GET /api/factus/test-connection
   */
  async testConnection(req, res) {
    try {
      const result = await factusService.testConnection();
      return res.json(result);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Simular evento de pago en Sandbox
   * POST /api/factus/simulate
   */
  async simulate(req, res) {
    try {
      const { reference_code, scenario, amount } = req.body;
      if (!reference_code) {
        return res.status(400).json({
          success: false,
          error: 'El campo reference_code es requerido para la simulación'
        });
      }

      const result = await factusService.simulatePayment({
        reference_code,
        scenario: scenario || 'paid',
        amount: amount || 25000
      });

      return res.json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Obtener registro de webhooks recibidos y detalles de configuración
   * GET /api/factus/webhooks
   */
  getWebhookLogs(req, res) {
    const logs = factusService.getWebhookLogs();
    return res.json(logs);
  }

  /**
   * Limpiar registro de webhooks
   * DELETE /api/factus/webhooks
   */
  clearWebhookLogs(req, res) {
    const result = factusService.clearWebhookLogs();
    return res.json(result);
  }

  /**
   * Obtener configuración pública de Factus Pay
   * GET /api/factus/config
   */
  getConfig(req, res) {
    return res.json({
      provider: 'factus_pay',
      email: config.email,
      environment: config.isProduction ? 'production' : 'sandbox',
      baseUrl: config.baseUrl,
      minAmount: config.minAmount,
      maxAmount: config.maxAmount,
      webhookKeyConfigured: !!config.webhookKey,
      webhookUrl: config.getWebhookUrl()
    });
  }

  /**
   * Endpoint receptor de Webhook oficial de Factus Pay
   * Valida la llave key en query string con crypto.timingSafeEqual,
   * garantiza idempotencia y responde en menos de 10s según la documentación
   * POST /api/factus/webhook?key=TU_LLAVE_SECRETA
   */
  async handleWebhook(req, res) {
    const providedKey = req.query.key;
    const payload = req.body;

    console.log('================================================================');
    console.log(`🔔 [FactusPay Webhook] Petición POST recibida (Key en query: ${providedKey ? 'Presente' : 'Ausente'})`);
    console.log('📦 Payload:', JSON.stringify(payload, null, 2));
    console.log('================================================================');

    const result = await factusService.processIncomingWebhook(providedKey, payload);
    return res.status(result.statusCode).json(result.responseBody);
  }

  /**
   * Stream de eventos en tiempo real para el frontend (Server-Sent Events)
   * GET /api/factus/events
   */
  streamEvents(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('event: connected\ndata: {"connected":true}\n\n');

    factusService.addSseClient(res);

    req.on('close', () => {
      factusService.removeSseClient(res);
    });
  }

  /**
   * Marcar o registrar que el código QR fue escaneado (estado started)
   * POST /api/factus/scan/:referenceCode
   */
  markAsScanned(req, res) {
    const { referenceCode } = req.params;
    if (!referenceCode) {
      return res.status(400).json({ success: false, error: 'referenceCode es requerido' });
    }

    const result = factusService.markAsScanned(referenceCode);
    return res.json(result);
  }
}

module.exports = new FactusController();
