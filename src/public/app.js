let currentCharge = null;
let timerInterval = null;
let pollingInterval = null;
const TOTAL_TIMER_SECONDS = 600; // 10 minutos (Regla Openpay)
let remainingSeconds = TOTAL_TIMER_SECONDS;

// Elementos DOM
const qrForm = document.getElementById('qrForm');
const amountInput = document.getElementById('amount');
const qrFormatSelect = document.getElementById('qrFormat');
const formatHelpText = document.getElementById('formatHelpText');
const directPhoneBox = document.getElementById('directPhoneBox');
const destPhoneInput = document.getElementById('destPhone');
const destEntitySelect = document.getElementById('destEntity');
const descriptionInput = document.getElementById('description');
const custNameInput = document.getElementById('custName');
const custLastNameInput = document.getElementById('custLastName');
const custEmailInput = document.getElementById('custEmail');
const custPhoneInput = document.getElementById('custPhone');
const btnGenerate = document.getElementById('btnGenerate');

const emptyState = document.getElementById('emptyState');
const qrActiveState = document.getElementById('qrActiveState');
const statusBadge = document.getElementById('statusBadge');
const qrImage = document.getElementById('qrImage');
const qrAmountPill = document.getElementById('qrAmountPill');
const qrOverlay = document.getElementById('qrOverlay');
const overlayText = document.getElementById('overlayText');
const timerClock = document.getElementById('timerClock');
const timerProgress = document.getElementById('timerProgress');
const simulationNotice = document.getElementById('simulationNotice');
const simulationReason = document.getElementById('simulationReason');
const instructionsBox = document.getElementById('instructionsBox');
const mobileLinkBox = document.getElementById('mobileLinkBox');
const mobilePayLink = document.getElementById('mobilePayLink');

const txIdSpan = document.getElementById('txId');
const txOrderIdSpan = document.getElementById('txOrderId');
const txFormatTypeSpan = document.getElementById('txFormatType');
const txCurrentStatusText = document.getElementById('txCurrentStatusText');

const btnSimulateCompleted = document.getElementById('btnSimulateCompleted');
const btnSimulateFailed = document.getElementById('btnSimulateFailed');
const btnSimulateCancelled = document.getElementById('btnSimulateCancelled');
const btnCheckStatus = document.getElementById('btnCheckStatus');
const btnToggleJson = document.getElementById('btnToggleJson');
const jsonViewer = document.getElementById('jsonViewer');
const jsonContent = document.getElementById('jsonContent');
const btnCloseJson = document.getElementById('btnCloseJson');
const merchantIdDisplay = document.getElementById('merchantIdDisplay');

// Mensajes de ayuda y visibilidad al cambiar de formato
qrFormatSelect.addEventListener('change', () => {
  const val = qrFormatSelect.value;
  if (val === 'direct_phone') {
    directPhoneBox.classList.remove('hidden');
    formatHelpText.textContent = 'Envía el dinero directamente a tu cuenta Nequi o Bancolombia (3503752816) con el monto precargado, sin intermediación de Openpay.';
  } else if (val === 'emv') {
    directPhoneBox.classList.add('hidden');
    formatHelpText.textContent = 'El Modo 2 genera la trama bancaria EMVCo oficial para apps de bancos (Bancolombia, Nequi, etc.).';
  } else if (val === 'webcheckout') {
    directPhoneBox.classList.add('hidden');
    formatHelpText.textContent = 'El Modo 1 oficial crea el link oficial de Openpay Sandbox con pasarela completa (Tarjetas, PSE, etc.).';
  } else {
    directPhoneBox.classList.add('hidden');
    formatHelpText.textContent = 'Checkout móvil alojado en tu servidor local Node.js para pruebas directas en tu red Wi-Fi.';
  }
});

// Cargar configuración al iniciar
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/qr/config');
    if (res.ok) {
      const cfg = await res.json();
      merchantIdDisplay.textContent = cfg.merchantId;
      document.getElementById('envText').textContent = `${cfg.environment.toUpperCase()} CO`;
    }
  } catch (err) {
    console.error('No se pudo cargar la configuración:', err);
  }

  // Botones de monto rápido
  document.querySelectorAll('.btn-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.val;
      amountInput.focus();
    });
  });
});

// Enviar formulario para generar QR
qrForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const amount = parseInt(amountInput.value, 10);
  if (!amount || amount < 1000) {
    alert('Por favor ingresa un monto válido mayor o igual a $1.000 COP');
    return;
  }

  const payload = {
    amount,
    description: descriptionInput.value.trim() || `Cobro de pedido ${amount} COP`,
    order_id: `ORD-${Date.now()}`,
    qr_format: qrFormatSelect.value,
    destination_phone: destPhoneInput ? destPhoneInput.value.trim() : '3503752816',
    destination_entity: destEntitySelect ? destEntitySelect.value : 'NEQUI',
    customer: {
      name: custNameInput.value.trim() || 'Carlos',
      last_name: custLastNameInput.value.trim() || 'Maldonado',
      email: custEmailInput.value.trim() || 'carlos@ejemplo.com',
      phone_number: custPhoneInput.value.trim() || '3001234567',
      destination_phone: destPhoneInput ? destPhoneInput.value.trim() : '3503752816',
      destination_entity: destEntitySelect ? destEntitySelect.value : 'NEQUI'
    }
  };

  btnGenerate.disabled = true;
  btnGenerate.innerHTML = '<span>⏳ Generando QR con Openpay...</span>';

  try {
    const response = await fetch('/api/qr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al generar el cargo QR en Openpay');
    }

    displayQrCharge(result.charge, result.is_simulation);
  } catch (error) {
    console.error('Error generando QR:', error);
    alert(`Error: ${error.message}`);
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.innerHTML = '<span class="btn-icon">⚡</span><span>Generar Código QR de Pago</span>';
  }
});

// Mostrar el QR y activar timers y polling
function displayQrCharge(charge, isSimulation) {
  currentCharge = charge;

  if (timerInterval) clearInterval(timerInterval);
  if (pollingInterval) clearInterval(pollingInterval);

  emptyState.classList.add('hidden');
  qrActiveState.classList.remove('hidden');
  qrOverlay.classList.add('hidden');
  jsonViewer.classList.add('hidden');

  if (isSimulation) {
    simulationNotice.classList.remove('hidden');
    simulationReason.textContent = charge.simulation_notice?.reason || 'A la espera de activación de parámetro QR en Openpay.';
  } else {
    simulationNotice.classList.add('hidden');
  }

  // Asignar imagen QR
  const base64Barcode = charge.payment_method?.barcode_base64;
  if (base64Barcode) {
    qrImage.src = `data:image/png;base64,${base64Barcode}`;
  }

  // Monto formateado
  const formattedAmount = Number(charge.amount).toLocaleString('es-CO');
  qrAmountPill.textContent = `$${formattedAmount} ${charge.currency || 'COP'}`;

  // Datos de la transacción
  txIdSpan.textContent = charge.id;
  txOrderIdSpan.textContent = charge.order_id || 'N/A';
  txCurrentStatusText.textContent = charge.status;

  let formatLabel = 'Bancario EMVCo (Redeban)';
  if (charge.payment_method?.format_type?.startsWith('direct_')) {
    formatLabel = `Directo a Celular (${charge.destination_entity || 'Nequi'} ${charge.destination_phone || '3503752816'})`;
  } else if (charge.payment_method?.format_type === 'openpay_official_webcheckout') {
    formatLabel = 'Webcheckout Oficial Openpay';
  } else if (charge.payment_method?.format_type === 'mobile_checkout_url') {
    formatLabel = 'Checkout Móvil Web';
  }
  txFormatTypeSpan.textContent = formatLabel;

  // Enlace móvil
  if (charge.payment_method?.mobile_pay_url) {
    mobileLinkBox.classList.remove('hidden');
    mobilePayLink.href = charge.payment_method.mobile_pay_url;
  } else {
    mobileLinkBox.classList.add('hidden');
  }

  // Instrucciones dinámicas
  if (charge.payment_method?.format_type?.startsWith('direct_')) {
    instructionsBox.innerHTML = `
      <p><strong>💸 Pago Directo a tu Celular (${charge.destination_phone || '3503752816'}):</strong></p>
      <ol style="margin-left:18px;margin-top:4px;">
        <li>El cliente abre su app de <strong>${charge.destination_entity || 'Nequi'} o Bancolombia</strong> y escanea este QR.</li>
        <li>La app prellena automáticamente el número <strong>${charge.destination_phone || '3503752816'}</strong> y el valor exacto de <strong>$${formattedAmount} COP</strong>.</li>
        <li>El cliente confirma y el dinero entra <strong>directo a tu saldo personal</strong> sin pasar por Openpay ni pagar comisiones.</li>
      </ol>
    `;
  } else if (charge.payment_method?.format_type === 'emvco_redeban') {
    instructionsBox.innerHTML = `
      <p><strong>🏦 Modo 2 (Bancario EMVCo):</strong></p>
      <ol style="margin-left:18px;margin-top:4px;">
        <li>Este QR fue generado bajo la norma bancaria EMVCo Redeban Colombia.</li>
        <li>Tu app de banco lo reconoce con éxito como un QR bancario válido.</li>
        <li><strong>Para probar la respuesta del sistema:</strong> Usa los botones de abajo en el <em>Panel de Simulación</em> (Aprobar, Rechazar o Cancelar) y observa la reacción en tiempo real.</li>
      </ol>
    `;
  } else if (charge.payment_method?.format_type === 'openpay_official_webcheckout') {
    instructionsBox.innerHTML = `
      <p><strong>🌐 Modo 1 (Webcheckout Oficial Openpay):</strong></p>
      <ol style="margin-left:18px;margin-top:4px;">
        <li>Abre la <strong>cámara normal de tu celular</strong> y apunta al QR (o haz clic en el botón verde de abajo).</li>
        <li>Se abrirá la pasarela oficial de Openpay Sandbox con opciones de Tarjeta y PSE de prueba.</li>
      </ol>
    `;
  } else {
    instructionsBox.innerHTML = `
      <p><strong>📱 Modo 1 (Enlace Móvil Local):</strong></p>
      <ol style="margin-left:18px;margin-top:4px;">
        <li>Apunta la cámara de tu celular al código QR y abre el enlace de pago.</li>
        <li>Toca "Confirmar y Pagar Ahora" para completar el cobro en vivo.</li>
      </ol>
    `;
  }

  updateStatusBadge(charge.status);
  startTimer();

  // Sondeo cada 15 segundos
  pollingInterval = setInterval(() => {
    checkChargeStatus(false);
  }, 15000);
}

// Temporizador reglamentario de 10 minutos
function startTimer() {
  remainingSeconds = TOTAL_TIMER_SECONDS;
  updateTimerUI();

  timerInterval = setInterval(() => {
    remainingSeconds--;
    updateTimerUI();

    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      if (pollingInterval) clearInterval(pollingInterval);
      handleExpiration();
    }
  }, 1000);
}

function updateTimerUI() {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  timerClock.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const percent = (remainingSeconds / TOTAL_TIMER_SECONDS) * 100;
  timerProgress.style.width = `${percent}%`;

  if (percent < 20) {
    timerProgress.style.backgroundColor = '#ef4444';
    timerClock.style.color = '#ef4444';
  } else if (percent < 50) {
    timerProgress.style.backgroundColor = '#f59e0b';
    timerClock.style.color = '#b45309';
  } else {
    timerProgress.style.backgroundColor = '#10b981';
    timerClock.style.color = '#047857';
  }
}

function handleExpiration() {
  updateStatusBadge('cancelled');
  qrOverlay.classList.remove('hidden');
  qrOverlay.style.background = 'rgba(239, 68, 68, 0.95)';
  overlayText.textContent = 'TIEMPO EXPIRADO (10 MIN)';
  document.getElementById('overlayIcon').textContent = '⏰';
}

// Consultar estado en Openpay
async function checkChargeStatus(isManual = true) {
  if (!currentCharge || !currentCharge.id) return;

  if (isManual) {
    btnCheckStatus.disabled = true;
    btnCheckStatus.innerHTML = '<span>🔄 Consultando...</span>';
  }

  try {
    const res = await fetch(`/api/qr/status/${currentCharge.id}`);
    const data = await res.json();

    if (data.success && data.charge) {
      currentCharge = data.charge;
      updateStatusBadge(data.charge.status);
      txCurrentStatusText.textContent = data.charge.status;

      // Actualizar visor JSON si está visible
      if (!jsonViewer.classList.contains('hidden')) {
        jsonContent.textContent = JSON.stringify(data, null, 2);
      }

      if (data.charge.status === 'completed') {
        onPaymentSuccess();
      } else if (data.charge.status === 'failed') {
        onPaymentFailed(data.charge.error_message);
      } else if (data.charge.status === 'cancelled') {
        handleExpiration();
      }
    }
  } catch (err) {
    console.error('Error al consultar estado:', err);
  } finally {
    if (isManual) {
      btnCheckStatus.disabled = false;
      btnCheckStatus.innerHTML = '<span>🔄 Consultar Estado API (GET)</span>';
    }
  }
}

function updateStatusBadge(status) {
  statusBadge.className = 'status-badge';
  txCurrentStatusText.textContent = status;
  switch (status) {
    case 'charge_pending':
      statusBadge.classList.add('status-pending');
      statusBadge.textContent = '⏳ PENDIENTE DE PAGO';
      txCurrentStatusText.style.color = '#b45309';
      break;
    case 'completed':
      statusBadge.classList.add('status-completed');
      statusBadge.textContent = '✅ PAGO COMPLETADO';
      txCurrentStatusText.style.color = '#10b981';
      break;
    case 'cancelled':
      statusBadge.classList.add('status-cancelled');
      statusBadge.textContent = '❌ EXPIRADO / CANCELADO';
      txCurrentStatusText.style.color = '#991b1b';
      break;
    case 'failed':
      statusBadge.classList.add('status-failed');
      statusBadge.textContent = '⚠️ TRANSACCIÓN FALLIDA';
      txCurrentStatusText.style.color = '#ef4444';
      break;
    default:
      statusBadge.classList.add('status-waiting');
      statusBadge.textContent = status || 'DESCONOCIDO';
  }
}

function onPaymentSuccess() {
  if (timerInterval) clearInterval(timerInterval);
  if (pollingInterval) clearInterval(pollingInterval);

  qrOverlay.classList.remove('hidden');
  qrOverlay.style.background = 'rgba(16, 185, 129, 0.95)';
  overlayText.textContent = '¡PAGO RECIBIDO EXITOSAMENTE!';
  document.getElementById('overlayIcon').textContent = '🎉';
}

function onPaymentFailed(reason) {
  if (timerInterval) clearInterval(timerInterval);
  if (pollingInterval) clearInterval(pollingInterval);

  qrOverlay.classList.remove('hidden');
  qrOverlay.style.background = 'rgba(239, 68, 68, 0.95)';
  overlayText.textContent = 'PAGO RECHAZADO';
  document.getElementById('overlayIcon').textContent = '❌';
  alert('Simulación de pago: ' + (reason || 'Transacción rechazada por el banco'));
}

// Botones de Simulación
async function triggerSimulation(targetStatus, reason = null) {
  if (!currentCharge || !currentCharge.id) return;

  try {
    const res = await fetch(`/api/qr/simulate-payment/${currentCharge.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus, reason })
    });
    const data = await res.json();
    if (data.success && data.charge) {
      currentCharge = data.charge;
      updateStatusBadge(data.charge.status);

      if (data.charge.status === 'completed') {
        onPaymentSuccess();
      } else if (data.charge.status === 'failed') {
        onPaymentFailed(data.charge.error_message);
      } else if (data.charge.status === 'cancelled') {
        handleExpiration();
      }

      if (!jsonViewer.classList.contains('hidden')) {
        jsonContent.textContent = JSON.stringify(data, null, 2);
      }
    } else {
      alert(data.message || 'No se pudo actualizar la simulación');
    }
  } catch (err) {
    alert('Error al simular: ' + err.message);
  }
}

btnSimulateCompleted.addEventListener('click', () => triggerSimulation('completed'));
btnSimulateFailed.addEventListener('click', () => triggerSimulation('failed', 'Fondos insuficientes en la cuenta del pagador'));
btnSimulateCancelled.addEventListener('click', () => triggerSimulation('cancelled', 'Cancelado por el usuario o expirado'));

btnCheckStatus.addEventListener('click', () => checkChargeStatus(true));

// Visor JSON
btnToggleJson.addEventListener('click', async () => {
  if (!currentCharge || !currentCharge.id) return;
  jsonViewer.classList.toggle('hidden');
  if (!jsonViewer.classList.contains('hidden')) {
    jsonContent.textContent = 'Cargando JSON desde la API...';
    try {
      const res = await fetch(`/api/qr/status/${currentCharge.id}`);
      const data = await res.json();
      jsonContent.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
      jsonContent.textContent = 'Error: ' + e.message;
    }
  }
});

btnCloseJson.addEventListener('click', () => {
  jsonViewer.classList.add('hidden');
});
