require('dotenv').config();

const config = {
  email: process.env.FACTUS_EMAIL || 'servicios@conectahogar.co',
  password: process.env.FACTUS_PASSWORD || '4Um72"1]*P(q',
  baseUrl: (process.env.FACTUS_BASE_URL || 'https://pay-api-sandbox.factus.com.co').replace(/\/$/, ''),
  isProduction: (process.env.FACTUS_BASE_URL || '').includes('pay-api.factus.com.co') && !(process.env.FACTUS_BASE_URL || '').includes('sandbox'),
  minAmount: 1000,
  maxAmount: 12100000,
  // Llave secreta para autenticar peticiones de webhook desde Factus Pay
  webhookKey: process.env.FACTUS_WEBHOOK_KEY || 'factus_whsec_7d9e4a1b8c2f530691e84a2d67c50b3e',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
};

config.getAuthUrl = function() {
  // Nota según documentación Factus: La ruta /auth NO lleva prefijo /v1
  return `${this.baseUrl}/auth`;
};

config.getCollectionsUrl = function() {
  return `${this.baseUrl}/v1/collections`;
};

config.getCollectionDetailUrl = function(referenceCode) {
  return `${this.baseUrl}/v1/collections/${encodeURIComponent(referenceCode)}`;
};

config.getWebhookUrl = function() {
  return `${this.publicBaseUrl}/api/factus/webhook?key=${this.webhookKey}`;
};

module.exports = config;
