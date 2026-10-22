const openpayService = require('../services/openpay.service');
const config = require('../config/openpay.config');

class QrController {
  /**
   * Generar nuevo cargo con Código QR
   * POST /api/qr/generate
   */
  async generateQr(req, res) {
    try {
      const { amount, description, customer, order_id, qr_format } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'El campo "amount" (monto a cobrar) es requerido'
        });
      }

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'El monto debe ser un número entero mayor a 0 (ej: 50000 para $50.000 COP)'
        });
      }

      const customerData = {
        name: customer?.name || 'Carlos',
        last_name: customer?.last_name || 'Maldonado',
        email: customer?.email || 'carlos@comercio.co',
        phone_number: customer?.phone_number || '3001234567',
        destination_phone: req.body.destination_phone || customer?.destination_phone || '3503752816',
        destination_entity: req.body.destination_entity || customer?.destination_entity || 'NEQUI'
      };

      const result = await openpayService.createQrCharge({
        amount: numAmount,
        description,
        order_id,
        customer: customerData,
        qr_format: qr_format || 'emv' // 'emv', 'webcheckout', 'url', 'direct_phone'
      });

      return res.status(201).json({
        success: true,
        message: 'Código QR generado satisfactoriamente',
        is_simulation: result.is_simulation,
        is_openpay_official: !!result.is_openpay_official,
        charge: result.data
      });
    } catch (error) {
      console.error('[QrController.generateQr] Error:', error.message);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message,
        details: error.openpayError || null
      });
    }
  }

  /**
   * Consultar estado de una transacción QR
   * GET /api/qr/status/:transactionId
   */
  async getStatus(req, res) {
    try {
      const { transactionId } = req.params;
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          error: 'El parámetro transactionId es requerido'
        });
      }

      const result = await openpayService.getChargeStatus(transactionId);
      return res.json({
        success: true,
        is_simulation: result.is_simulation,
        charge: result.data
      });
    } catch (error) {
      console.error('[QrController.getStatus] Error:', error.message);
      return res.status(error.status || 500).json({
        success: false,
        error: error.message,
        details: error.openpayError || null
      });
    }
  }

  /**
   * Simular estado del pago (completed, failed, cancelled)
   * POST /api/qr/simulate-payment/:transactionId
   */
  async simulatePayment(req, res) {
    try {
      const { transactionId } = req.params;
      const targetStatus = req.body?.status || 'completed';
      const reason = req.body?.reason || null;

      const result = openpayService.simulatePayment(transactionId, targetStatus, reason);
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.json({
        success: true,
        message: `Estado actualizado a "${targetStatus}"`,
        charge: result.data
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Obtener configuración pública del comercio
   * GET /api/qr/config
   */
  getConfig(req, res) {
    return res.json({
      merchantId: config.merchantId,
      publicKey: config.publicKey,
      baseUrl: config.baseUrl,
      currency: config.defaultCurrency,
      environment: config.baseUrl.includes('sandbox') ? 'sandbox' : 'production',
      fallbackSimulationEnabled: config.enableFallbackSimulation
    });
  }

  /**
   * Servir pantalla de pago móvil cuando el usuario escanea el QR con la cámara de su celular
   * GET /pay/:transactionId
   */
  renderMobilePayPage(req, res) {
    const { transactionId } = req.params;
    const charge = openpayService.getSimulatedCharge(transactionId);

    if (!charge) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Pago no encontrado</title>
          <style>body{font-family:system-ui;text-align:center;padding:40px;background:#f8fafc;color:#0f172a;}</style>
        </head>
        <body>
          <h2>❌ Cobro no encontrado o expirado</h2>
          <p>La orden ${transactionId} ya no está disponible.</p>
        </body>
        </html>
      `);
    }

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pagar con Openpay Colombia</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', system-ui, sans-serif; background: #f0f4f8; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
          .checkout-card { background: #fff; width: 100%; max-width: 400px; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); text-align: center; }
          .header { margin-bottom: 20px; }
          .logo { background: #002663; color: #fff; display: inline-block; padding: 6px 16px; border-radius: 8px; font-weight: 800; letter-spacing: 1px; font-size: 0.9rem; margin-bottom: 8px; }
          .merchant-title { font-size: 0.85rem; color: #64748b; }
          .amount-tag { font-size: 2.2rem; font-weight: 800; color: #002663; margin: 16px 0 6px; }
          .currency { font-size: 1rem; color: #64748b; }
          .desc { font-size: 0.9rem; color: #334155; margin-bottom: 20px; }
          .info-list { background: #f8fafc; border-radius: 10px; padding: 14px; font-size: 0.82rem; text-align: left; margin-bottom: 24px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .info-row:last-child { margin-bottom: 0; }
          .info-label { color: #64748b; }
          .info-val { font-weight: 600; color: #1e293b; }
          .btn-pay { width: 100%; background: #10b981; color: #fff; border: none; padding: 14px; border-radius: 10px; font-size: 1.05rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
          .btn-pay:hover { background: #059669; }
          .success-box { display: none; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 12px; padding: 20px; margin-top: 16px; }
          .success-icon { font-size: 3rem; margin-bottom: 8px; }
          .success-title { font-size: 1.2rem; font-weight: 800; color: #065f46; margin-bottom: 4px; }
          .success-msg { font-size: 0.85rem; color: #047857; }
        </style>
      </head>
      <body>
        <div class="checkout-card">
          <div class="header">
            <div class="logo">OPENPAY COLOMBIA</div>
            <div class="merchant-title">Pasarela de Pagos Segura (Sandbox)</div>
          </div>

          <div class="amount-tag">$${Number(charge.amount).toLocaleString('es-CO')} <span class="currency">COP</span></div>
          <div class="desc">${charge.description || 'Cobro mediante Código QR'}</div>

          <div class="info-list">
            <div class="info-row"><span class="info-label">Comercio ID:</span><span class="info-val">mmihmqoqpbfcobqezvs6</span></div>
            <div class="info-row"><span class="info-label">Orden:</span><span class="info-val">${charge.order_id || 'N/A'}</span></div>
            <div class="info-row"><span class="info-label">Cliente:</span><span class="info-val">${charge.customer?.name} ${charge.customer?.last_name || ''}</span></div>
            <div class="info-row"><span class="info-label">Estado:</span><span class="info-val" id="statusVal" style="color:#b45309">Pendiente</span></div>
          </div>

          <div id="payAction">
            <button class="btn-pay" id="btnConfirmPay" onclick="doPayment()">
              <span>💳 Confirmar y Pagar Ahora</span>
            </button>
          </div>

          <div class="success-box" id="successBox">
            <div class="success-icon">✅</div>
            <div class="success-title">¡Pago Autorizado!</div>
            <div class="success-msg">La transacción ha sido aprobada con éxito. Puedes cerrar esta ventana.</div>
          </div>
        </div>

        <script>
          async function doPayment() {
            const btn = document.getElementById('btnConfirmPay');
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Procesando pago...</span>';

            try {
              const res = await fetch('/api/qr/simulate-payment/${transactionId}', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed' })
              });
              const data = await res.json();
              if (data.success) {
                document.getElementById('payAction').style.display = 'none';
                document.getElementById('successBox').style.display = 'block';
                document.getElementById('statusVal').textContent = 'Completado';
                document.getElementById('statusVal').style.color = '#10b981';
              } else {
                alert(data.message || 'Error procesando');
                btn.disabled = false;
                btn.innerHTML = '<span>💳 Confirmar y Pagar Ahora</span>';
              }
            } catch(e) {
              alert('Error de conexión');
              btn.disabled = false;
            }
          }
        </script>
      </body>
      </html>
    `;

    return res.send(html);
  }
}

module.exports = new QrController();
