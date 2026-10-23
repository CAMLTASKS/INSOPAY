const express = require('express');
const cors = require('cors');
const path = require('path');
const openpayConfig = require('./config/openpay.config');
const factusConfig = require('./config/factus.config');
const qrRoutes = require('./routes/qr.routes');
const factusRoutes = require('./routes/factus.routes');
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

// Rutas de las pasarelas
app.use('/api/qr', qrRoutes);        // Openpay & Directo
app.use('/api/factus', factusRoutes); // Factus Pay

// Health check global
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      openpay: {
        active: true,
        merchantId: openpayConfig.merchantId,
        environment: openpayConfig.baseUrl.includes('sandbox') ? 'sandbox' : 'production'
      },
      factus_pay: {
        active: true,
        email: factusConfig.email,
        environment: factusConfig.isProduction ? 'production' : 'sandbox',
        baseUrl: factusConfig.baseUrl
      }
    },
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
const server = app.listen(openpayConfig.port, () => {
  console.log('================================================================');
  console.log('🚀 SERVIDOR DE PAGOS QR COLOMBIA (OPENPAY & FACTUS PAY)');
  console.log(`📡 URL Local:        http://localhost:${openpayConfig.port}`);
  console.log(`🏦 Openpay Merchant: ${openpayConfig.merchantId} (${openpayConfig.baseUrl})`);
  console.log(`⚡ Factus Pay:       ${factusConfig.email} (${factusConfig.baseUrl})`);
  console.log(`💰 Moneda:           ${openpayConfig.defaultCurrency}`);
  console.log('================================================================');
  console.log(`👉 Prueba la interfaz visual en: http://localhost:${openpayConfig.port}`);
});

module.exports = { app, server };
