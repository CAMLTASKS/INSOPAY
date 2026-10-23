/**
 * PayHub Colombia - Controlador del Dashboard Frontend
 * Soporte completo para Factus Pay (Bre-B Oficial), Directo Celular y Openpay Colombia
 */

document.addEventListener('DOMContentLoaded', () => {
  // ========================================================
  // VARIABLES DE ESTADO GLOBAL (Inicializadas al inicio)
  // ========================================================
  let currentCollectionsPage = 1;
  let totalCollectionsPages = 1;
  let currentPollingInterval = null;
  let activeCreatedReference = null;
  let activeCreatedQrBase64 = null;
  let currentWebhookKey = 'factus_whsec_7d9e4a1b8c2f530691e84a2d67c50b3e';

  // ========================================================
  // 1. NAVEGACIÓN PRINCIPAL (TOP NAVBAR)
  // ========================================================
  const navButtons = document.querySelectorAll('.main-nav-tabs .nav-btn');
  const moduleSections = document.querySelectorAll('.module-section');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModuleId = btn.getAttribute('data-module');

      // Actualizar botones del nav
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Mostrar módulo seleccionado
      moduleSections.forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === targetModuleId) {
          sec.classList.add('active');
        }
      });

      // Cargar datos correspondientes al cambiar de pestaña
      if (targetModuleId === 'module-factus') {
        loadFactusCollections();
      } else if (targetModuleId === 'module-webhooks') {
        loadWebhookLogs();
      }
    });
  });

  // ========================================================
  // 2. SUB-NAVEGACIÓN DEL MÓDULO FACTUS PAY
  // ========================================================
  const factusSubnavButtons = document.querySelectorAll('.sub-nav-bar .sub-nav-btn');
  const factusSubtabPanels = document.querySelectorAll('.subtab-panel');

  function switchFactusSubtab(targetSubtabId) {
    factusSubnavButtons.forEach(b => {
      b.classList.remove('active');
      if (b.getAttribute('data-subtab') === targetSubtabId) {
        b.classList.add('active');
      }
    });

    factusSubtabPanels.forEach(panel => {
      panel.classList.remove('active');
      if (panel.id === targetSubtabId) {
        panel.classList.add('active');
      }
    });

    if (targetSubtabId === 'factus-history') {
      loadFactusCollections();
    } else if (targetSubtabId === 'factus-diagnostics') {
      testFactusPing();
    }
  }

  factusSubnavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSubtab = btn.getAttribute('data-subtab');
      switchFactusSubtab(targetSubtab);
    });
  });

  // Configurar chips de monto rápido en formulario Factus
  document.querySelectorAll('.quick-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('factusAmount').value = chip.getAttribute('data-amt');
    });
  });

  // ========================================================
  // 3. FACTUS PAY: GENERAR RECAUDO BRE-B
  // ========================================================
  const factusCreateForm = document.getElementById('factusCreateForm');
  const btnFactusSubmit = document.getElementById('btnFactusSubmit');
  const btnFactusText = document.getElementById('btnFactusText');
  const factusEmptyState = document.getElementById('factusEmptyState');
  const factusActiveState = document.getElementById('factusActiveState');
  const factusStatusBadge = document.getElementById('factusStatusBadge');
  const factusQrImg = document.getElementById('factusQrImg');
  const factusQrAmount = document.getElementById('factusQrAmount');
  const factusBrebKey = document.getElementById('factusBrebKey');
  const factusRefCode = document.getElementById('factusRefCode');
  const factusStatusText = document.getElementById('factusStatusText');
  const factusCreatedAtText = document.getElementById('factusCreatedAtText');
  const factusExpiresAtText = document.getElementById('factusExpiresAtText');
  const factusPollingStatus = document.getElementById('factusPollingStatus');

  factusCreateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amountVal = parseInt(document.getElementById('factusAmount').value, 10);
    const descVal = document.getElementById('factusDescription').value;
    const customRefVal = document.getElementById('factusCustomRef').value.trim();

    if (isNaN(amountVal) || amountVal < 1000 || amountVal > 12100000) {
      alert('El monto a cobrar debe estar entre $1.000 y $12.100.000 COP');
      return;
    }

    btnFactusSubmit.disabled = true;
    btnFactusText.textContent = 'Generando con Factus Pay...';

    try {
      const response = await fetch('/api/factus/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountVal,
          description: descVal,
          reference_code: customRefVal || undefined
        })
      });

      const resData = await response.json();

      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Error creando recaudo en Factus Pay');
      }

      const col = resData.data;
      activeCreatedReference = col.reference_code;
      activeCreatedQrBase64 = col.qr || col.qr_image;

      // Renderizar vista del QR activo
      factusEmptyState.classList.add('hidden');
      factusActiveState.classList.remove('hidden');

      factusQrImg.src = activeCreatedQrBase64;
      factusQrAmount.textContent = `$${Number(col.amount).toLocaleString('es-CO')} COP`;
      factusBrebKey.textContent = col.breb_key || 'No asignada';
      factusRefCode.textContent = col.reference_code;
      factusStatusText.textContent = col.status;
      factusStatusText.className = `status-pill status-${col.status}`;
      factusCreatedAtText.textContent = col.created_at || 'Ahora';
      factusExpiresAtText.textContent = col.qr_expires_at || 'En 24 horas';

      factusStatusBadge.textContent = col.status.toUpperCase();
      factusStatusBadge.className = `status-badge status-${col.status}`;

      // Iniciar polling para verificar el pago en tiempo real
      startPollingFactusPayment(col.reference_code);

      // Precargar para simulación rápida
      document.getElementById('simRefCode').value = col.reference_code;
      document.getElementById('simAmount').value = col.amount;

      // Refrescar historial en segundo plano
      loadFactusCollections();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      btnFactusSubmit.disabled = false;
      btnFactusText.textContent = 'Generar Código QR Factus Pay';
    }
  });

  const factusScannedBanner = document.getElementById('factusScannedBanner');
  const factusPaidBanner = document.getElementById('factusPaidBanner');
  const factusPaidPayerText = document.getElementById('factusPaidPayerText');

  function applyStartedState(refCode) {
    if (factusScannedBanner) factusScannedBanner.classList.remove('hidden');
    if (factusPaidBanner) factusPaidBanner.classList.add('hidden');
    factusStatusText.textContent = 'started (Escaneado en banco)';
    factusStatusText.className = 'status-pill status-started';
    factusStatusBadge.textContent = 'STARTED';
    factusStatusBadge.className = 'status-badge status-started';
    factusPollingStatus.innerHTML = `<strong style="color:#0284c7;">📱 ¡Código QR escaneado por el cliente! Esperando autorización en su app bancaria...</strong>`;
  }

  function applyPaidState(data) {
    if (currentPollingInterval) clearInterval(currentPollingInterval);
    if (factusScannedBanner) factusScannedBanner.classList.add('hidden');
    if (factusPaidBanner) factusPaidBanner.classList.remove('hidden');

    factusStatusText.textContent = 'paid';
    factusStatusText.className = 'status-pill status-paid';
    factusStatusBadge.textContent = 'PAID';
    factusStatusBadge.className = 'status-badge status-paid';

    if (data.payer && data.payer.name && factusPaidPayerText) {
      factusPaidPayerText.innerHTML = `Pagado por: <strong>${data.payer.name}</strong> (${data.payer.document_type || 'CC'} ${data.payer.document_number || ''})`;
    }

    factusPollingStatus.innerHTML = `<strong class="text-success">🎉 ¡PAGO CONFIRMADO Y REGISTRADO EXITOSAMENTE!</strong>`;
    loadFactusCollections();
    loadWebhookLogs();
  }

  // Polling automático (cada 2.5 segundos para respuesta ultrarrápida)
  function startPollingFactusPayment(refCode) {
    if (currentPollingInterval) clearInterval(currentPollingInterval);
    if (factusScannedBanner) factusScannedBanner.classList.add('hidden');
    if (factusPaidBanner) factusPaidBanner.classList.add('hidden');

    factusPollingStatus.innerHTML = `<span class="dot-pulse"></span><span>Escuchando en vivo escaneo del QR y confirmación de pago...</span>`;

    currentPollingInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/factus/status/${encodeURIComponent(refCode)}`);
        const data = await res.json();
        if (data.success && data.data) {
          const status = data.data.status;

          if (status === 'started') {
            applyStartedState(refCode);
          } else if (status === 'paid') {
            applyPaidState(data.data);
          } else if (status === 'failed' || status === 'rejected') {
            clearInterval(currentPollingInterval);
            factusStatusText.textContent = status;
            factusStatusText.className = `status-pill status-${status}`;
            factusStatusBadge.textContent = status.toUpperCase();
            factusStatusBadge.className = `status-badge status-${status}`;
            factusPollingStatus.innerHTML = `<strong class="text-danger">❌ La transacción fue rechazada o falló.</strong>`;
          }
        }
      } catch (e) {
        console.warn('Error en polling:', e);
      }
    }, 2500);
  }

  // Conexión Server-Sent Events (SSE) para reflejar cambios en 0 ms
  function initRealtimeEventStream() {
    try {
      const evtSource = new EventSource('/api/factus/events');

      evtSource.addEventListener('qr_scanned', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('⚡ [SSE] Evento recibido: qr_scanned', data);
          if (activeCreatedReference && data.reference_code === activeCreatedReference) {
            applyStartedState(data.reference_code);
          }
          loadFactusCollections();
        } catch (err) {}
      });

      evtSource.addEventListener('payment_update', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('⚡ [SSE] Evento recibido: payment_update', data);
          if (activeCreatedReference && data.reference_code === activeCreatedReference) {
            if (data.status === 'paid') {
              applyPaidState(data);
            } else if (data.status === 'started') {
              applyStartedState(data.reference_code);
            }
          }
          loadFactusCollections();
          loadWebhookLogs();
        } catch (err) {}
      });

      evtSource.onerror = () => {
        console.warn('Reconectando SSE en segundo plano...');
      };
    } catch (e) {
      console.warn('SSE no disponible:', e);
    }
  }

  initRealtimeEventStream();

  // Botón Simular Escaneo Rápido (started)
  const btnScanQuick = document.getElementById('btnSimulateScanQuick');
  if (btnScanQuick) {
    btnScanQuick.addEventListener('click', async () => {
      if (!activeCreatedReference) {
        alert('Genera primero un código QR');
        return;
      }
      try {
        const res = await fetch(`/api/factus/scan/${encodeURIComponent(activeCreatedReference)}`, { method: 'POST' });
        const data = await res.json();
        applyStartedState(activeCreatedReference);
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    });
  }

  // Botón Simular Pago Aprobado Rápido (paid)
  const btnPayQuick = document.getElementById('btnSimulatePayQuick');
  if (btnPayQuick) {
    btnPayQuick.addEventListener('click', async () => {
      if (!activeCreatedReference) {
        alert('Genera primero un código QR');
        return;
      }
      try {
        const res = await fetch('/api/factus/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference_code: activeCreatedReference,
            scenario: 'paid',
            amount: 25000
          })
        });
        const data = await res.json();
        applyPaidState({
          reference_code: activeCreatedReference,
          status: 'paid',
          payer: data.simulated_payload?.data?.payer
        });
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    });
  }

  // Copiar llave Bre-B
  document.getElementById('btnCopyBrebKey').addEventListener('click', () => {
    const key = factusBrebKey.textContent;
    if (key && key !== '-') {
      navigator.clipboard.writeText(key).then(() => {
        alert(`¡Llave Bre-B copiada: ${key}!`);
      });
    }
  });

  // Descargar QR
  document.getElementById('btnFactusDownloadQr').addEventListener('click', () => {
    if (!activeCreatedQrBase64) return;
    const link = document.createElement('a');
    link.href = activeCreatedQrBase64;
    link.download = `QR-FactusPay-${activeCreatedReference || 'pago'}.png`;
    link.click();
  });

  // Consultar Estado Ahora
  document.getElementById('btnFactusQueryStatus').addEventListener('click', async () => {
    if (!activeCreatedReference) return;
    try {
      const res = await fetch(`/api/factus/status/${encodeURIComponent(activeCreatedReference)}`);
      const data = await res.json();
      if (data.success && data.data) {
        alert(`Estado en Factus Pay: ${data.data.status.toUpperCase()}`);
        factusStatusText.textContent = data.data.status;
        factusStatusText.className = `status-pill status-${data.data.status}`;
      }
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
  });

  // Ir a simular este pago
  document.getElementById('btnFactusSimulateFromCard').addEventListener('click', () => {
    if (activeCreatedReference) {
      document.getElementById('simRefCode').value = activeCreatedReference;
      switchFactusSubtab('factus-simulate');
    }
  });

  // ========================================================
  // 4. FACTUS PAY: HISTORIAL DE PAGOS (COLLECTIONS)
  // ========================================================
  async function loadFactusCollections(page = 1) {
    const tableBody = document.getElementById('tableCollectionsBody');
    const filterStatus = document.getElementById('factusFilterStatus').value;
    const searchQuery = document.getElementById('factusSearchQuery').value.trim();

    tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4">Cargando recaudos desde Factus Pay...</td></tr>`;

    try {
      let queryUrl = `/api/factus/collections?page=${page}`;
      if (filterStatus && filterStatus !== 'all') queryUrl += `&status=${filterStatus}`;
      if (searchQuery) queryUrl += `&reference_code=${encodeURIComponent(searchQuery)}`;

      const res = await fetch(queryUrl);
      const resData = await res.json();

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'Error consultando listado de Factus Pay');
      }

      const collections = resData.data || [];
      const meta = resData.meta || { current_page: 1, last_page: 1, total: collections.length };

      currentCollectionsPage = meta.current_page || 1;
      totalCollectionsPages = meta.last_page || 1;

      // Actualizar paginador
      document.getElementById('factusPageIndicator').textContent = `Página ${currentCollectionsPage} de ${totalCollectionsPages}`;
      document.getElementById('btnFactusPrevPage').disabled = currentCollectionsPage <= 1;
      document.getElementById('btnFactusNextPage').disabled = currentCollectionsPage >= totalCollectionsPages;

      // Actualizar contadores
      const totalCount = meta.total || collections.length;
      document.getElementById('factusHistoryCount').textContent = totalCount;
      document.getElementById('metricTotalCollections').textContent = totalCount;

      let sumAmount = 0;
      let paidCount = 0;
      let readyCount = 0;

      if (collections.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No se encontraron recaudos registrados.</td></tr>`;
        return;
      }

      let rowsHtml = '';
      collections.forEach(col => {
        const amt = Number(col.amount) || 0;
        sumAmount += amt;
        if (col.status === 'paid') paidCount++;
        if (col.status === 'ready') readyCount++;

        rowsHtml += `
          <tr>
            <td><strong class="font-mono">${col.reference_code}</strong></td>
            <td><strong>$${amt.toLocaleString('es-CO')}</strong></td>
            <td><code class="code-key">${col.breb_key || '-'}</code></td>
            <td>${col.created_at || '-'}</td>
            <td><span class="status-pill status-${col.status}">${col.status}</span></td>
            <td class="text-right">
              <button class="btn btn-sm btn-outline btn-view-detail" data-ref="${col.reference_code}">
                👁️ Ver Detalle / QR
              </button>
            </td>
          </tr>
        `;
      });

      tableBody.innerHTML = rowsHtml;

      document.getElementById('metricTotalAmount').textContent = `$${sumAmount.toLocaleString('es-CO')}`;
      document.getElementById('metricPaidCollections').textContent = paidCount;
      document.getElementById('metricReadyCollections').textContent = readyCount;

      // Vincular botones de ver detalle
      document.querySelectorAll('.btn-view-detail').forEach(btn => {
        btn.addEventListener('click', () => {
          const ref = btn.getAttribute('data-ref');
          openDetailModal(ref);
        });
      });
    } catch (err) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger">Error: ${err.message}</td></tr>`;
    }
  }

  // Paginador
  document.getElementById('btnFactusPrevPage').addEventListener('click', () => {
    if (currentCollectionsPage > 1) {
      loadFactusCollections(currentCollectionsPage - 1);
    }
  });

  document.getElementById('btnFactusNextPage').addEventListener('click', () => {
    if (currentCollectionsPage < totalCollectionsPages) {
      loadFactusCollections(currentCollectionsPage + 1);
    }
  });

  document.getElementById('factusFilterStatus').addEventListener('change', () => loadFactusCollections(1));
  document.getElementById('btnFactusSearch').addEventListener('click', () => loadFactusCollections(1));
  document.getElementById('btnFactusRefreshHistory').addEventListener('click', () => loadFactusCollections(currentCollectionsPage));

  // ========================================================
  // 5. MODAL DE DETALLE Y QR
  // ========================================================
  const detailModal = document.getElementById('detailModal');
  const modalQrImg = document.getElementById('modalQrImg');
  const modalMetaTable = document.getElementById('modalMetaTable');

  async function openDetailModal(refCode) {
    detailModal.classList.remove('hidden');
    modalMetaTable.innerHTML = `<p class="text-center py-4">Cargando detalles de ${refCode}...</p>`;
    modalQrImg.src = '';

    try {
      const res = await fetch(`/api/factus/status/${encodeURIComponent(refCode)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error cargando detalle');
      }

      const col = data.data;
      if (col.qr) {
        modalQrImg.src = col.qr;
      } else {
        modalQrImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="20" y="100" fill="%2364748b">QR no disponible</text></svg>';
      }

      modalMetaTable.innerHTML = `
        <div class="meta-row"><span class="meta-label">Referencia:</span><strong class="font-mono">${col.reference_code}</strong></div>
        <div class="meta-row"><span class="meta-label">Monto:</span><strong class="text-primary font-bold">$${Number(col.amount).toLocaleString('es-CO')} COP</strong></div>
        <div class="meta-row"><span class="meta-label">Llave Bre-B:</span><code class="code-key">${col.breb_key || '-'}</code></div>
        <div class="meta-row"><span class="meta-label">Estado:</span><span class="status-pill status-${col.status}">${col.status}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha Creación:</span><span>${col.created_at || '-'}</span></div>
        <div class="meta-row"><span class="meta-label">Expira:</span><span>${col.qr_expires_at || '-'}</span></div>
      `;
    } catch (e) {
      modalMetaTable.innerHTML = `<p class="text-danger text-center">Error: ${e.message}</p>`;
    }
  }

  function closeDetailModal() {
    detailModal.classList.add('hidden');
  }

  document.getElementById('btnModalClose').addEventListener('click', closeDetailModal);
  document.getElementById('btnModalCloseFooter').addEventListener('click', closeDetailModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) closeDetailModal();
  });

  // ========================================================
  // 6. FACTUS PAY: VERIFICAR ESTADO EN TIEMPO REAL
  // ========================================================
  const factusVerifyForm = document.getElementById('factusVerifyForm');
  const verifyRefCodeInput = document.getElementById('verifyRefCodeInput');
  const verifyResultCard = document.getElementById('verifyResultCard');
  const verifyStatusPill = document.getElementById('verifyStatusPill');
  const verifyRefTitle = document.getElementById('verifyRefTitle');
  const verifyAmountDisplay = document.getElementById('verifyAmountDisplay');
  const verifyBrebKey = document.getElementById('verifyBrebKey');
  const verifyCreatedAt = document.getElementById('verifyCreatedAt');
  const verifyExpiresAt = document.getElementById('verifyExpiresAt');
  const verifyQrImg = document.getElementById('verifyQrImg');
  const verifyQrEmpty = document.getElementById('verifyQrEmpty');
  const verifyRawJson = document.getElementById('verifyRawJson');

  factusVerifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const refCode = verifyRefCodeInput.value.trim();
    if (!refCode) return;

    try {
      const res = await fetch(`/api/factus/status/${encodeURIComponent(refCode)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Recaudo no encontrado');
      }

      const col = data.data;
      verifyResultCard.classList.remove('hidden');

      verifyStatusPill.textContent = col.status;
      verifyStatusPill.className = `status-pill status-${col.status}`;
      verifyRefTitle.textContent = col.reference_code;
      verifyAmountDisplay.textContent = `$${Number(col.amount).toLocaleString('es-CO')} COP`;
      verifyBrebKey.textContent = col.breb_key || 'No disponible';
      verifyCreatedAt.textContent = col.created_at || '-';
      verifyExpiresAt.textContent = col.qr_expires_at || '-';

      if (col.qr) {
        verifyQrImg.src = col.qr;
        verifyQrImg.classList.remove('hidden');
        verifyQrEmpty.classList.add('hidden');
      } else {
        verifyQrImg.classList.add('hidden');
        verifyQrEmpty.classList.remove('hidden');
      }

      verifyRawJson.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  // ========================================================
  // 7. FACTUS PAY: SIMULADOR SANDBOX
  // ========================================================
  const factusSimulateForm = document.getElementById('factusSimulateForm');
  const simRefCode = document.getElementById('simRefCode');
  const simAmount = document.getElementById('simAmount');
  const simScenario = document.getElementById('simScenario');
  const simulationOutputBox = document.getElementById('simulationOutputBox');

  factusSimulateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ref = simRefCode.value.trim();
    const amt = simAmount.value;
    const scen = simScenario.value;

    if (!ref) {
      alert('Ingresa el código de referencia');
      return;
    }

    try {
      const res = await fetch('/api/factus/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_code: ref,
          amount: amt,
          scenario: scen
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error en la simulación');
      }

      const isSuccess = data.resulting_status === 'paid';

      simulationOutputBox.innerHTML = `
        <div class="alert-info mt-2" style="background:${isSuccess ? '#ecfdf5' : '#fef2f2'}; border-color:${isSuccess ? '#a7f3d0' : '#fecaca'}; color:${isSuccess ? '#065f46' : '#991b1b'};">
          <strong>${data.message}</strong>
          <p class="mt-2">Estado resultante: <span class="status-pill status-${data.resulting_status}">${data.resulting_status}</span></p>
        </div>
        <h4 class="mt-3">Payload del Webhook Generado:</h4>
        <pre class="json-pre mt-2" style="background:#0f172a; color:#38bdf8; padding:1rem; border-radius:8px;">${JSON.stringify(data.simulated_payload, null, 2)}</pre>
      `;

      loadWebhookLogs();
      loadFactusCollections();
    } catch (err) {
      alert(`Error en simulación: ${err.message}`);
    }
  });

  // ========================================================
  // 8. DIAGNÓSTICO & PING FACTUS
  // ========================================================
  const btnPingFactus = document.getElementById('btnPingFactus');
  const diagLatencyText = document.getElementById('diagLatencyText');

  async function testFactusPing() {
    diagLatencyText.textContent = 'Midiendo...';
    try {
      const res = await fetch('/api/factus/test-connection');
      const data = await res.json();
      if (data.success) {
        diagLatencyText.innerHTML = `<span class="text-success font-bold">${data.latencyMs} ms (Excelente)</span>`;
      } else {
        diagLatencyText.innerHTML = `<span class="text-danger">${data.error || 'Error'}</span>`;
      }
    } catch (e) {
      diagLatencyText.textContent = 'Fallo de conexión';
    }
  }

  btnPingFactus.addEventListener('click', testFactusPing);

  // Configurar URLs y llaves de Webhook
  async function updateWebhookDisplayUrls() {
    try {
      const res = await fetch('/api/factus/config');
      const data = await res.json();
      if (data.webhookKeyConfigured) {
        const whRes = await fetch('/api/factus/webhooks');
        const whData = await whRes.json();
        if (whData.webhook_key) {
          currentWebhookKey = whData.webhook_key;
        }
      }
    } catch (e) {
      console.warn('Error obteniendo config de webhook:', e);
    }

    const cleanUrl = `${window.location.origin}/api/factus/webhook`;
    const fullUrl = `${cleanUrl}?key=${currentWebhookKey}`;

    const cleanEl = document.getElementById('webhookCleanUrl');
    const keyEl = document.getElementById('webhookSecretKey');
    const fullEl = document.getElementById('webhookFullUrl');

    if (cleanEl) cleanEl.textContent = cleanUrl;
    if (keyEl) keyEl.textContent = currentWebhookKey;
    if (fullEl) fullEl.textContent = fullUrl;
  }

  updateWebhookDisplayUrls();

  // Copiar URL limpia
  const btnCopyClean = document.getElementById('btnCopyWebhookCleanUrl');
  if (btnCopyClean) {
    btnCopyClean.addEventListener('click', () => {
      const url = `${window.location.origin}/api/factus/webhook`;
      navigator.clipboard.writeText(url).then(() => alert(`¡URL del Webhook copiada:\n${url}`));
    });
  }

  // Copiar llave secreta
  const btnCopyKey = document.getElementById('btnCopyWebhookSecretKey');
  if (btnCopyKey) {
    btnCopyKey.addEventListener('click', () => {
      navigator.clipboard.writeText(currentWebhookKey).then(() => alert(`¡Llave secreta copiada:\n${currentWebhookKey}`));
    });
  }

  // Copiar URL con query
  const btnCopyFull = document.getElementById('btnCopyWebhookUrl');
  if (btnCopyFull) {
    btnCopyFull.addEventListener('click', () => {
      const fullUrl = `${window.location.origin}/api/factus/webhook?key=${currentWebhookKey}`;
      navigator.clipboard.writeText(fullUrl).then(() => alert(`¡URL completa copiada:\n${fullUrl}`));
    });
  }

  // Botón probar webhook directo
  const btnTestDirect = document.getElementById('btnTestWebhookDirect');
  if (btnTestDirect) {
    btnTestDirect.addEventListener('click', async () => {
      btnTestDirect.disabled = true;
      btnTestDirect.textContent = 'Enviando petición de prueba al webhook...';

      const samplePayload = {
        data: {
          reference_code: `TEST-${Date.now()}`,
          amount: 50000.0,
          status: "paid",
          created_at: new Date().toISOString(),
          qr_expires_at: new Date(Date.now() + 86400000).toISOString(),
          payer: {
            name: "Carlos Maldonado",
            document_type: "CC",
            document_number: "1098765432"
          },
          qr: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
        }
      };

      try {
        const res = await fetch(`/api/factus/webhook?key=${encodeURIComponent(currentWebhookKey)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(samplePayload)
        });

        const resData = await res.json();
        if (res.ok) {
          alert(`✅ Webhook verificado exitosamente!\n\nHTTP ${res.status} OK\nRespuesta de tu servidor: ${JSON.stringify(resData, null, 2)}`);
          loadWebhookLogs();
        } else {
          alert(`❌ Webhook rechazó la petición:\n\nHTTP ${res.status}\n${JSON.stringify(resData, null, 2)}`);
        }
      } catch (err) {
        alert(`Error probando webhook: ${err.message}`);
      } finally {
        btnTestDirect.disabled = false;
        btnTestDirect.textContent = '🧪 Probar Petición POST Real al Webhook Local con Llave Secreta';
      }
    });
  }

  // ========================================================
  // 9. MONITOR DE WEBHOOKS EN VIVO
  // ========================================================
  const tableWebhooksBody = document.getElementById('tableWebhooksBody');
  const navWebhooksCount = document.getElementById('navWebhooksCount');

  async function loadWebhookLogs() {
    try {
      const res = await fetch('/api/factus/webhooks');
      const data = await res.json();
      const logs = data.logs || [];

      navWebhooksCount.textContent = logs.length;

      if (logs.length === 0) {
        tableWebhooksBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No hay webhooks registrados aún.</td></tr>`;
        return;
      }

      let rows = '';
      logs.forEach(log => {
        const payerDisplay = log.payer && log.payer.name 
          ? `<strong style="color:#0f172a;">${log.payer.name}</strong><br><small class="text-muted">${log.payer.document_type || 'ID'}: ${log.payer.document_number || ''}</small>` 
          : '<span class="text-muted">-</span>';

        const dupBadge = log.is_duplicate ? ' <span class="badge-count" style="background:#fee2e2; color:#991b1b;">Reintento</span>' : '';

        rows += `
          <tr>
            <td class="font-mono text-muted">${log.id}</td>
            <td>${new Date(log.received_at).toLocaleTimeString()}</td>
            <td><strong class="font-mono text-primary">${log.event}</strong></td>
            <td><strong class="font-mono">${log.reference_code}</strong>${dupBadge}</td>
            <td>${log.amount ? `$${Number(log.amount).toLocaleString('es-CO')}` : '-'}</td>
            <td>${payerDisplay}</td>
            <td><span class="status-pill status-${log.status}">${log.status}</span></td>
            <td>
              <button class="btn btn-sm btn-outline btn-show-wh-json" data-json='${encodeURIComponent(JSON.stringify(log.raw_payload))}'>
                JSON
              </button>
            </td>
          </tr>
        `;
      });

      tableWebhooksBody.innerHTML = rows;

      document.querySelectorAll('.btn-show-wh-json').forEach(b => {
        b.addEventListener('click', () => {
          const raw = decodeURIComponent(b.getAttribute('data-json'));
          alert(`Payload Webhook:\n\n${raw}`);
        });
      });
    } catch (e) {
      console.warn('Error cargando webhooks:', e);
    }
  }

  document.getElementById('btnRefreshWebhooks').addEventListener('click', loadWebhookLogs);
  document.getElementById('btnClearWebhooks').addEventListener('click', async () => {
    if (confirm('¿Vaciar logs de webhooks?')) {
      await fetch('/api/factus/webhooks', { method: 'DELETE' });
      loadWebhookLogs();
    }
  });

  // ========================================================
  // 10. MÓDULO DIRECTO CELULAR (3503752816 / BANCO CAJA SOCIAL)
  // ========================================================
  const directPhoneForm = document.getElementById('directPhoneForm');
  const directQrImg = document.getElementById('directQrImg');
  const directQrEmpty = document.getElementById('directQrEmpty');
  const directMetaTable = document.getElementById('directMetaTable');
  const directDestText = document.getElementById('directDestText');

  directPhoneForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amountVal = document.getElementById('directPhoneAmount').value;
    const phoneVal = document.getElementById('directPhoneNum').value;
    const entityVal = document.getElementById('directEntity').value;
    const conceptVal = document.getElementById('directConcept').value;

    try {
      const res = await fetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountVal,
          format: 'direct_phone',
          dest_phone: phoneVal,
          dest_entity: entityVal,
          description: conceptVal
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error generando QR Directo');

      directQrEmpty.classList.add('hidden');
      directQrImg.classList.remove('hidden');
      directQrImg.src = data.qr_image;
      directMetaTable.style.display = 'block';

      const entityNames = {
        CAJA_SOCIAL: 'Banco Caja Social (1032 / Bre-B)',
        NEQUI: 'Nequi (+57)',
        BANCOLOMBIA: 'Bancolombia',
        BRE_B: 'Bre-B Interoperable'
      };

      directDestText.textContent = `${phoneVal} (${entityNames[entityVal] || entityVal})`;
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  // ========================================================
  // 11. MÓDULO OPENPAY COLOMBIA
  // ========================================================
  const openpayForm = document.getElementById('openpayForm');
  const openpayQrImg = document.getElementById('openpayQrImg');
  const openpayQrEmpty = document.getElementById('openpayQrEmpty');
  const openpayLinkContainer = document.getElementById('openpayLinkContainer');
  const openpayWebLink = document.getElementById('openpayWebLink');

  openpayForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amountVal = document.getElementById('openpayAmount').value;
    const formatVal = document.getElementById('openpayFormat').value;
    const conceptVal = document.getElementById('openpayConcept').value;

    try {
      const res = await fetch('/api/qr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountVal,
          format: formatVal,
          description: conceptVal
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error con Openpay');

      openpayQrEmpty.classList.add('hidden');
      openpayQrImg.classList.remove('hidden');
      openpayQrImg.src = data.qr_image;

      if (data.checkout_url) {
        openpayLinkContainer.style.display = 'block';
        openpayWebLink.href = data.checkout_url;
      } else {
        openpayLinkContainer.style.display = 'none';
      }
    } catch (err) {
      alert(`Error Openpay: ${err.message}`);
    }
  });

  // ========================================================
  // 12. ESCÁNER CON CÁMARA EN VIVO (Html5Qrcode)
  // ========================================================
  const scannerModal = document.getElementById('scannerModal');
  const btnOpenScannerModal = document.getElementById('btnOpenScannerModal');
  const btnCloseScannerModal = document.getElementById('btnCloseScannerModal');
  const btnCancelScanner = document.getElementById('btnCancelScanner');
  const scannerResultBox = document.getElementById('scannerResultBox');
  const scannerBrebKey = document.getElementById('scannerBrebKey');
  const scannerAmount = document.getElementById('scannerAmount');
  const btnScannerConfirmPay = document.getElementById('btnScannerConfirmPay');

  let html5QrCodeScanner = null;

  async function startCameraScanner() {
    scannerModal.classList.remove('hidden');
    scannerResultBox.classList.add('hidden');

    if (!window.Html5Qrcode) {
      alert('La librería del escáner no se ha cargado todavía. Verifica tu conexión a internet.');
      return;
    }

    try {
      if (html5QrCodeScanner) {
        await html5QrCodeScanner.stop().catch(() => {});
      }

      html5QrCodeScanner = new Html5Qrcode("reader");

      const config = { fps: 10, qrbox: { width: 220, height: 220 } };

      await html5QrCodeScanner.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          console.log("📷 QR Decodificado por la cámara:", decodedText);

          // Extraer Llave Bre-B si existe en el payload (@FC...)
          const brebMatch = decodedText.match(/@FC[A-Z0-9]+/i);
          const foundKey = brebMatch ? brebMatch[0] : (document.getElementById('factusBrebKey')?.textContent || 'Detectado');

          // Extraer monto
          const foundAmt = document.getElementById('factusQrAmount')?.textContent || '$25.000 COP';

          scannerBrebKey.textContent = foundKey;
          scannerAmount.textContent = foundAmt;
          scannerResultBox.classList.remove('hidden');

          // Detener la cámara tras decodificar
          try { await html5QrCodeScanner.stop(); } catch(e){}

          // Notificar al backend que el código fue escaneado (estado started)
          if (activeCreatedReference) {
            await fetch(`/api/factus/scan/${encodeURIComponent(activeCreatedReference)}`, { method: 'POST' });
            applyStartedState(activeCreatedReference);
          }
        },
        () => {}
      );
    } catch (err) {
      console.error("Error iniciando cámara:", err);
      alert(`No se pudo acceder a la cámara: ${err.message || err}`);
      closeCameraScanner();
    }
  }

  async function closeCameraScanner() {
    if (html5QrCodeScanner) {
      try {
        await html5QrCodeScanner.stop();
      } catch(e) {}
      html5QrCodeScanner = null;
    }
    scannerModal.classList.add('hidden');
  }

  if (btnOpenScannerModal) {
    btnOpenScannerModal.addEventListener('click', startCameraScanner);
  }
  if (btnCloseScannerModal) {
    btnCloseScannerModal.addEventListener('click', closeCameraScanner);
  }
  if (btnCancelScanner) {
    btnCancelScanner.addEventListener('click', closeCameraScanner);
  }

  // Autorizar pago desde el escáner
  if (btnScannerConfirmPay) {
    btnScannerConfirmPay.addEventListener('click', async () => {
      if (!activeCreatedReference) {
        alert('No hay recaudo activo');
        return;
      }
      try {
        const amt = Number(factusQrAmount.textContent.replace(/[^0-9]/g, '')) || 25000;
        const res = await fetch('/api/factus/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference_code: activeCreatedReference,
            scenario: 'paid',
            amount: amt
          })
        });
        const data = await res.json();
        applyPaidState({
          reference_code: activeCreatedReference,
          status: 'paid',
          payer: data.simulated_payload?.data?.payer
        });
        closeCameraScanner();
      } catch (err) {
        alert(`Error procesando pago: ${err.message}`);
      }
    });
  }

  // Carga inicial
  testFactusPing();
  loadFactusCollections();
  loadWebhookLogs();
});
