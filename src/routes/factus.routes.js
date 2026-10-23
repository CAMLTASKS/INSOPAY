const express = require('express');
const router = express.Router();
const factusController = require('../controllers/factus.controller');

// Generar nuevo código QR de recaudo Factus Pay
router.post('/generate', (req, res) => factusController.generateQr(req, res));

// Crear recaudo (alias estándar REST POST /collections)
router.post('/collections', (req, res) => factusController.generateQr(req, res));

// Consultar estado de un recaudo por referenceCode
router.get('/status/:referenceCode', (req, res) => factusController.getStatus(req, res));
router.get('/collections/:referenceCode', (req, res) => factusController.getStatus(req, res));

// Listar recaudos registrados (con paginación y filtros)
router.get('/collections', (req, res) => factusController.listCollections(req, res));

// Probar conectividad y latencia con la API de Factus Pay
router.get('/test-connection', (req, res) => factusController.testConnection(req, res));

// Simular escenarios de pago (Sandbox)
router.post('/simulate', (req, res) => factusController.simulate(req, res));

// Historial y gestión de webhooks recibidos
router.get('/webhooks', (req, res) => factusController.getWebhookLogs(req, res));
router.delete('/webhooks', (req, res) => factusController.clearWebhookLogs(req, res));

// Stream en tiempo real vía Server-Sent Events (SSE)
router.get('/events', (req, res) => factusController.streamEvents(req, res));

// Marcar código QR como escaneado por el pagador (estado started)
router.post('/scan/:referenceCode', (req, res) => factusController.markAsScanned(req, res));

// Información de configuración pública
router.get('/config', (req, res) => factusController.getConfig(req, res));

// Receptor de Webhook oficial Factus Pay
router.post('/webhook', (req, res) => factusController.handleWebhook(req, res));

module.exports = router;
