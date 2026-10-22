const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qr.controller');

// Generar nuevo código QR de pago
router.post('/generate', (req, res) => qrController.generateQr(req, res));

// Consultar estado de una transacción QR
router.get('/status/:transactionId', (req, res) => qrController.getStatus(req, res));

// Simular pago completado (Sandbox testing)
router.post('/simulate-payment/:transactionId', (req, res) => qrController.simulatePayment(req, res));

// Configuración pública (Merchant ID, moneda, ambiente)
router.get('/config', (req, res) => qrController.getConfig(req, res));

module.exports = router;
