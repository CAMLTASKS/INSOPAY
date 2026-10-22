const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/openpay.config');
const qrRoutes = require('./routes/qr.routes');
const qrController = require('./controllers/qr.controller');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir frontend web estático para pruebas interactivas
app.use(express.static(path.join(__dirname, 'public')));

// Ruta directa para pago móvil al escanear QR con la cámara del celular
app.get('/pay/:transactionId', (req, res) => qrController.renderMobilePayPage(req, res));

// Rutas de la API
app.use('/api/qr', qrRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Openpay QR Payment Service (Colombia)',
    merchantId: config.merchantId,
    environment: config.baseUrl.includes('sandbox') ? 'sandbox' : 'production',
    timestamp: new Date().toISOString()
  });
});

// Manejador de rutas no encontradas
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// Iniciar servidor
const server = app.listen(config.port, () => {
  console.log('================================================================');
  console.log('🚀 SERVICIO OPENPAY QR COLOMBIA INICIADO');
  console.log(`📡 URL Local:        http://localhost:${config.port}`);
  console.log(`🏦 Merchant ID:      ${config.merchantId}`);
  console.log(`🌐 Openpay URL:      ${config.baseUrl}`);
  console.log(`💰 Moneda:           ${config.defaultCurrency}`);
  console.log(`⏱️  Temporizador QR:  10 minutos (Reglamentario Openpay)`);
  console.log('================================================================');
  console.log(`👉 Prueba la interfaz visual en: http://localhost:${config.port}`);
});

module.exports = { app, server };
