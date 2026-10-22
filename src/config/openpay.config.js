require('dotenv').config();

const config = {
  merchantId: process.env.OPENPAY_MERCHANT_ID || 'mmihmqoqpbfcobqezvs6',
  secretKey: process.env.OPENPAY_SECRET_KEY || 'sk_d6d93ebea13e44f093f1eb75179161e7',
  publicKey: process.env.OPENPAY_PUBLIC_KEY || 'pk_1ea642830c114f56b04a353f5ab94e14',
  baseUrl: (process.env.OPENPAY_BASE_URL || 'https://sandbox-api.openpay.co/v1').replace(/\/$/, ''),
  port: parseInt(process.env.PORT, 10) || 3000,
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'COP',
  enableFallbackSimulation: process.env.ENABLE_QR_FALLBACK_SIMULATION === 'true'
};

// Openpay usa autenticación Basic HTTP: usuario = secretKey, contraseña = vacía
config.getAuthHeader = function () {
  const token = Buffer.from(`${this.secretKey}:`).toString('base64');
  return `Basic ${token}`;
};

// URL completa para cargos directos a comercio
config.getChargesUrl = function () {
  return `${this.baseUrl}/${this.merchantId}/charges`;
};

// URL para consultar un cargo específico
config.getChargeDetailUrl = function (transactionId) {
  return `${this.baseUrl}/${this.merchantId}/charges/${transactionId}`;
};

// URL para cargos a clientes específicos
config.getCustomerChargesUrl = function (customerId) {
  return `${this.baseUrl}/${this.merchantId}/customers/${customerId}/charges`;
};

module.exports = config;
