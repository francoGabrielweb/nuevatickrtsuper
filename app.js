/**
 * app.js — StockControl main application
 */

// ─── Utils ────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' toast-' + type : ''}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = (iso + '').split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function daysUntil(expiryDateStr) {
  if (!expiryDateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(expiryDateStr + 'T00:00:00');
  return Math.floor((exp - today) / 86400000);
}

function expiryBadge(days) {
  if (days === null) return '<span class="badge badge-info">Sin fecha</span>';
  if (days < 0)  return `<span class="badge badge-danger">Vencido</span>`;
  if (days === 0) return `<span class="badge badge-danger">Vence hoy</span>`;
  if (days <= 7) return `<span class="badge badge-danger">${days}d</span>`;
  if (days <= 30) return `<span class="badge badge-warn">${days}d</span>`;
  return `<span class="badge badge-ok">${days}d</span>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── Auth flow ────────────────────────────────────────────────────

async function initAuth() {
  if (AUTH.isAuthenticated()) {
    showApp();
    return;
  }
  $('login-screen').classList.remove('hidden');
  $('app').classList.add('hidden');

  $('btn-login').addEventListener('click', attemptLogin);
  $('input-pass').addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
  $('input-user').addEventListener('keydown', e => { if (e.key === 'Enter') $('input-pass').focus(); });
}

async function attemptLogin() {
  const user = $('input-user').value.trim();
  const pass = $('input-pass').value;
  if (!user || !pass) return;

  $('btn-login').disabled = true;
  $('btn-login').textContent = 'Verificando...';

  const result = await AUTH.login(user, pass);

  $('btn-login').disabled = false;
  $('btn-login').textContent = 'Ingresar';

  if (result.ok) {
    $('login-screen').classList.add('hidden');
    showApp();
  } else {
    const err = $('login-error');
    err.textContent = result.error;
    err.classList.remove('hidden');
    $('input-pass').value = '';
    setTimeout(() => err.classList.add('hidden'), 5000);
  }
}

function showApp() {
  $('app').classList.remove('hidden');
  $('login-screen').classList.add('hidden');
  $('btn-logout').addEventListener('click', () => {
    AUTH.logout();
    location.reload();
  });
  initApp();
}

// ─── Navigation ───────────────────────────────────────────────────

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      $('section-' + btn.dataset.section).classList.add('active');
      // Reload data when switching tabs
      if (btn.dataset.section === 'inventory') loadInventory();
      if (btn.dataset.section === 'expiry') loadExpiry();
      if (btn.dataset.section === 'reports') loadReports();
    });
  });
}

// ─── Scanner ──────────────────────────────────────────────────────

let scannerStream = null;
let scannerInterval = null;
let lastScanned = null;

async function initScanner() {
  const startBtn = $('btn-start-scan');
  const stopBtn  = $('btn-stop-scan');

  if (!('BarcodeDetector' in window)) {
    $('scanner-status').textContent = 'BarcodeDetector no disponible en este navegador. Usá el campo manual.';
    startBtn.disabled = true;
    startBtn.textContent = 'No disponible';
    return;
  }

  startBtn.addEventListener('click', startCamera);
  stopBtn.addEventListener('click', stopCamera);
  $('btn-manual-scan').addEventListener('click', () => {
    const code = $('manual-barcode').value.trim();
    if (code) handleScannedCode(code);
  });
  $('manual-barcode').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const code = $('manual-barcode').value.trim();
      if (code) handleScannedCode(code);
    }
  });
}

async function startCamera() {
  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } }
    });
    const video = $('scanner-video');
    video.srcObject = scannerStream;
    await video.play();

    $('btn-start-scan').classList.add('hidden');
    $('btn-stop-scan').classList.remove('hidden');
    $('scanner-status').textContent = 'Apuntá al código de barras';

    const detector = new BarcodeDetector({ formats: [
      'ean_13','ean_8','code_128','code_39','code_93',
      'codabar','itf','qr_code','data_matrix','upc_a','upc_e'
    ]});

    scannerInterval = setInterval(async () => {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code !== lastScanned) {
            lastScanned = code;
            handleScannedCode(code);
            // Brief pause after detection
            clearInterval(scannerInterval);
            setTimeout(() => {
              lastScanned = null;
              if (scannerStream) {
                scannerInterval = setInterval(async () => {
                  try {
                    const b2 = await detector.detect(video);
                    if (b2.length > 0 && b2[0].rawValue !== lastScanned) {
                      lastScanned = b2[0].rawValue;
                      handleScannedCode(b2[0].rawValue);
                    }
                  } catch(e) {}
                }, 500);
              }
            }, 3000);
          }
        }
      } catch(e) {}
    }, 500);

  } catch (e) {
    $('scanner-status').textContent = 'No se pudo acceder a la cámara: ' + e.message;
  }
}

function stopCamera() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  if (scannerInterval) {
    clearInterval(scannerInterval);
    scannerInterval = null;
  }
  $('scanner-video').srcObject = null;
  $('btn-start-scan').classList.remove('hidden');
  $('btn-stop-scan').classList.add('hidden');
  $('scanner-status').textContent = 'Iniciando cámara...';
  lastScanned = null;
}

async function handleScannedCode(barcode) {
  $('scanner-status').textContent = `Código: ${barcode}`;
  $('manual-barcode').value = barcode;

  const result = await DB.getProductWithLots(barcode);

  $('panel-empty').classList.add('hidden');
  $('panel-existing').classList.add('hidden');
  $('panel-new').classList.add('hidden');

  if (result) {
    showExistingProduct(result.product, result.lots);
  } else {
    showNewProduct(barcode);
  }
}

function showExistingProduct(product, lots) {
  const panel = $('panel-existing');
  panel.classList.remove('hidden');

  $('pe-name').textContent = product.name;
  $('pe-barcode').textContent = product.barcode;
  $('pe-cat').textContent = product.category;
  $('pe-lots').textContent = lots.length;
  $('pe-units').textContent = lots.reduce((s, l) => s + (l.qty || 0), 0);

  const upcoming = lots
    .filter(l => l.expiry)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  
  $('pe-next-exp').textContent = upcoming.length ? formatDateShort(upcoming[0].expiry) : 'Sin fecha';

  // Set today as default for expiry
  $('pe-exp').value = '';
  $('pe-qty').value = 1;
  $('pe-price').value = '';
  $('pe-notes').value = '';

  $('btn-add-lot').onclick = async () => {
    const qty = parseInt($('pe-qty').value) || 0;
    if (qty < 1) { toast('Ingresá una cantidad válida', 'error'); return; }

    await DB.addLot({
      productId: product.id,
      barcode: product.barcode,
      qty,
      expiry: $('pe-exp').value || null,
      price: parseFloat($('pe-price').value) || null,
      notes: $('pe-notes').value.trim()
    });

    toast(`Ingreso registrado: ${qty} ${product.unit}(s) de ${product.name}`, 'success');
    // Refresh display
    const updated = await DB.getProductWithLots(product.barcode);
    if (updated) showExistingProduct(updated.product, updated.lots);
  };
}

function showNewProduct(barcode) {
  const panel = $('panel-new');
  panel.classList.remove('hidden');

  $('pn-barcode').textContent = barcode;
  $('pn-name').value = '';
  $('pn-qty').value = 1;
  $('pn-exp').value = '';
  $('pn-price').value = '';

  $('btn-register-new').onclick = async () => {
    const name = $('pn-name').value.trim();
    if (!name) { toast('El nombre es obligatorio', 'error'); return; }

    const qty = parseInt($('pn-qty').value) || 1;
    const productId = await DB.addProduct({
      barcode,
      name,
      category: $('pn-cat').value,
      unit: $('pn-unit').value
    });

    await DB.addLot({
      productId,
      barcode,
      qty,
      expiry: $('pn-exp').value || null,
      price: parseFloat($('pn-price').value) || null,
      notes: ''
    });

    toast(`Producto registrado: ${name}`, 'success');

    const result = await DB.getProductWithLots(barcode);
    if (result) {
      $('panel-new').classList.add('hidden');
      showExistingProduct(result.product, result.lots);
    }
  };
}

// ─── Inventory ────────────────────────────────────────────────────

async function loadInventory() {
  const inventory = await DB.getAllInventory();
  const search = $('inv-search').value.toLowerCase();
  const catFilter = $('inv-cat-filter').value;

  const filtered = inventory.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search) ||
      p.barcode.toLowerCase().includes(search);
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  // Metrics
  const totalProducts = inventory.length;
  const totalUnits = inventory.reduce((s, p) => s + p.lots.reduce((ls, l) => ls + (l.qty||0), 0), 0);
  
  const today = new Date(); today.setHours(0,0,0,0);
  let expiring7 = 0, expired = 0;
  inventory.forEach(p => p.lots.forEach(l => {
    if (!l.expiry) return;
    const days = daysUntil(l.expiry);
    if (days < 0) expired++;
    else if (days <= 7) expiring7++;
  }));

  $('inv-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Productos</div><div class="metric-value">${totalProducts}</div></div>
    <div class="metric"><div class="metric-label">Unidades totales</div><div class="metric-value">${totalUnits}</div></div>
    <div class="metric"><div class="metric-label">Vencen en 7 días</div><div class="metric-value ${expiring7>0?'amber':''}">${expiring7} lotes</div></div>
    <div class="metric"><div class="metric-label">Vencidos</div><div class="metric-value ${expired>0?'red':''}">${expired} lotes</div></div>
  `;

  const tbody = $('inv-tbody');
  tbody.innerHTML = '';

  if (filtered.length === 0) {
    $('inv-empty').classList.remove('hidden');
    return;
  }
  $('inv-empty').classList.add('hidden');

  filtered.forEach(p => {
    const totalQty = p.lots.reduce((s, l) => s + (l.qty||0), 0);
    const upcoming = p.lots
      .filter(l => l.expiry)
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
    
    const nextExp = upcoming[0] || null;
    const days = nextExp ? daysUntil(nextExp.expiry) : null;

    let statusBadge;
    if (days === null) statusBadge = '<span class="badge badge-info">Sin fecha</span>';
    else if (days < 0)  statusBadge = '<span class="badge badge-danger">Con vencidos</span>';
    else if (days <= 7) statusBadge = '<span class="badge badge-danger">Crítico</span>';
    else if (days <= 30) statusBadge = '<span class="badge badge-warn">Por vencer</span>';
    else statusBadge = '<span class="badge badge-ok">OK</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(p.name)}</strong></td>
      <td><code style="font-size:11px">${escHtml(p.barcode)}</code></td>
      <td>${escHtml(p.category)}</td>
      <td>${p.lots.length}</td>
      <td><strong>${totalQty}</strong> ${escHtml(p.unit)}(s)</td>
      <td>${nextExp ? formatDateShort(nextExp.expiry) : '—'}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn-icon" title="Ver detalle" data-id="${p.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </button>
      </td>
    `;

    tr.querySelector('.btn-icon').addEventListener('click', () => openProductModal(p));
    tbody.appendChild(tr);
  });
}

function openProductModal(product) {
  DB.getLotsByProduct(product.id).then(lots => {
    $('modal-title').textContent = product.name;

    const sorted = [...lots].sort((a, b) => {
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return a.expiry.localeCompare(b.expiry);
    });

    let html = `
      <div style="margin-bottom:1rem">
        <span class="badge badge-info">${escHtml(product.category)}</span>
        <code style="font-size:12px;margin-left:8px">${escHtml(product.barcode)}</code>
        <span style="font-size:12px;color:var(--text2);margin-left:8px">Registrado ${formatDate(product.createdAt)}</span>
      </div>
      <h4 style="font-size:13px;margin-bottom:.75rem;color:var(--text2)">Lotes registrados (${sorted.length})</h4>
    `;

    if (sorted.length === 0) {
      html += '<p style="color:var(--text3);font-size:13px">No hay lotes registrados.</p>';
    } else {
      sorted.forEach(l => {
        const days = l.expiry ? daysUntil(l.expiry) : null;
        html += `
          <div class="lot-row">
            <div>
              <div class="lot-field-label">Ingreso</div>
              <div class="lot-field-value">${formatDate(l.enteredAt)}</div>
            </div>
            <div>
              <div class="lot-field-label">Cantidad</div>
              <div class="lot-field-value">${l.qty} ${escHtml(product.unit)}(s)</div>
            </div>
            <div>
              <div class="lot-field-label">Vencimiento</div>
              <div class="lot-field-value">${l.expiry ? formatDateShort(l.expiry) : '—'}</div>
            </div>
            <div>${expiryBadge(days)}</div>
          </div>
          ${l.notes ? `<p style="font-size:12px;color:var(--text2);margin-bottom:.5rem;padding:0 4px">Nota: ${escHtml(l.notes)}</p>` : ''}
        `;
      });
    }

    $('modal-body').innerHTML = html;
    $('modal-detail').classList.remove('hidden');
  });
}

// ─── Expiry ───────────────────────────────────────────────────────

async function loadExpiry() {
  const filterVal = $('exp-filter').value;
  const days = filterVal === 'all' ? 9999 : parseInt(filterVal);

  const lots = await DB.getExpiryReport(days);

  // Metrics
  const expired = lots.filter(l => l.daysLeft < 0).length;
  const today7  = lots.filter(l => l.daysLeft >= 0 && l.daysLeft <= 7).length;
  const today30 = lots.filter(l => l.daysLeft >= 0 && l.daysLeft <= 30).length;
  const totalQty = lots.reduce((s, l) => s + (l.qty||0), 0);

  $('exp-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Lotes encontrados</div><div class="metric-value">${lots.length}</div></div>
    <div class="metric"><div class="metric-label">Vencidos</div><div class="metric-value ${expired>0?'red':''}">${expired}</div></div>
    <div class="metric"><div class="metric-label">Vencen en 7 días</div><div class="metric-value ${today7>0?'amber':''}">${today7}</div></div>
    <div class="metric"><div class="metric-label">Unidades afectadas</div><div class="metric-value">${totalQty}</div></div>
  `;

  const tbody = $('exp-tbody');
  tbody.innerHTML = '';

  if (lots.length === 0) {
    $('exp-empty').classList.remove('hidden');
    return;
  }
  $('exp-empty').classList.add('hidden');

  lots.forEach(l => {
    const days = l.daysLeft;
    let statusBadge;
    if (days < 0)  statusBadge = '<span class="badge badge-danger">Vencido</span>';
    else if (days === 0) statusBadge = '<span class="badge badge-danger">Hoy</span>';
    else if (days <= 7) statusBadge = '<span class="badge badge-danger">Urgente</span>';
    else if (days <= 30) statusBadge = '<span class="badge badge-warn">Próximo</span>';
    else statusBadge = '<span class="badge badge-ok">OK</span>';

    const daysText = days < 0 ? `<strong style="color:var(--red)">${Math.abs(days)}d vencido</strong>` : `${days}d`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(l.product.name || '—')}</strong></td>
      <td><code style="font-size:11px">${escHtml(l.barcode || '')}</code></td>
      <td>${escHtml(l.product.category || '—')}</td>
      <td style="font-size:12px;color:var(--text2)">${formatDate(l.enteredAt)}</td>
      <td>${l.qty} ${escHtml(l.product.unit || '')}(s)</td>
      <td>${formatDateShort(l.expiry)}</td>
      <td>${statusBadge}</td>
      <td>${daysText}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Reports ──────────────────────────────────────────────────────

async function loadReports() {
  const inventory = await DB.getAllInventory();
  const allLots = await DB.getAllLots();

  // Metrics
  const totalProducts = inventory.length;
  const totalLots = allLots.length;
  const totalUnits = allLots.reduce((s, l) => s + (l.qty||0), 0);
  const critical = allLots.filter(l => {
    if (!l.expiry) return false;
    return daysUntil(l.expiry) <= 7;
  }).length;

  $('rep-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Productos únicos</div><div class="metric-value">${totalProducts}</div></div>
    <div class="metric"><div class="metric-label">Ingresos totales</div><div class="metric-value">${totalLots}</div></div>
    <div class="metric"><div class="metric-label">Unidades en stock</div><div class="metric-value">${totalUnits}</div></div>
    <div class="metric"><div class="metric-label">Lotes críticos</div><div class="metric-value ${critical>0?'red':''}">${critical}</div></div>
  `;

  // By category
  const catMap = {};
  inventory.forEach(p => {
    const key = p.category || 'Sin categoría';
    if (!catMap[key]) catMap[key] = { products: 0, units: 0 };
    catMap[key].products++;
    catMap[key].units += p.lots.reduce((s, l) => s + (l.qty||0), 0);
  });

  const maxProducts = Math.max(...Object.values(catMap).map(v => v.products), 1);
  const catHtml = Object.entries(catMap)
    .sort((a, b) => b[1].products - a[1].products)
    .map(([cat, v]) => `
      <div class="rep-cat-row">
        <span class="rep-cat-name">${escHtml(cat)}</span>
        <div class="rep-cat-bar-wrap"><div class="rep-cat-bar" style="width:${Math.round(v.products/maxProducts*100)}%"></div></div>
        <span class="rep-cat-count">${v.products} prod.</span>
        <span class="rep-cat-count" style="color:var(--text)">${v.units} u.</span>
      </div>
    `).join('');

  $('rep-by-cat').innerHTML = catMap && Object.keys(catMap).length > 0 ? catHtml : '<p style="padding:1rem;color:var(--text3);font-size:13px">Sin datos aún</p>';

  // Recent entries (last 30 days)
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = allLots
    .filter(l => l.enteredAt >= cutoff)
    .sort((a, b) => b.enteredAt.localeCompare(a.enteredAt))
    .slice(0, 10);

  const productMap = {};
  inventory.forEach(p => productMap[p.id] = p);

  const recentHtml = recent.length > 0 ? `
    <table style="font-size:12px">
      <thead><tr><th>Producto</th><th>Cant.</th><th>Vencimiento</th><th>Ingreso</th></tr></thead>
      <tbody>
        ${recent.map(l => {
          const prod = productMap[l.productId];
          return `<tr>
            <td>${prod ? escHtml(prod.name) : '—'}</td>
            <td>${l.qty}</td>
            <td>${l.expiry ? formatDateShort(l.expiry) : '—'}</td>
            <td style="color:var(--text2)">${formatDate(l.enteredAt)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  ` : '<p style="padding:1rem;color:var(--text3);font-size:13px">Sin ingresos en los últimos 30 días</p>';

  $('rep-recent').innerHTML = recentHtml;

  // Critical alerts
  const criticalLots = allLots
    .filter(l => l.expiry && daysUntil(l.expiry) <= 7)
    .map(l => ({ ...l, product: productMap[l.productId] || {}, days: daysUntil(l.expiry) }))
    .sort((a, b) => a.days - b.days);

  const critHtml = criticalLots.length > 0 ? `
    <table style="font-size:12px">
      <thead><tr><th>Producto</th><th>Categoría</th><th>Cantidad</th><th>Vencimiento</th><th>Estado</th></tr></thead>
      <tbody>
        ${criticalLots.map(l => `<tr>
          <td><strong>${l.product.name ? escHtml(l.product.name) : '—'}</strong></td>
          <td>${l.product.category ? escHtml(l.product.category) : '—'}</td>
          <td>${l.qty} u.</td>
          <td>${formatDateShort(l.expiry)}</td>
          <td>${expiryBadge(l.days)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  ` : '<p style="padding:1rem;font-size:13px;color:var(--text2)">No hay lotes críticos. ✓</p>';

  $('rep-critical').innerHTML = critHtml;
}

// ─── Export CSV ───────────────────────────────────────────────────

async function exportCSV() {
  const inventory = await DB.getAllInventory();
  const rows = [['Producto','Código','Categoría','Unidad','Qty Lote','Vencimiento','Precio','Ingresado','Notas']];

  inventory.forEach(p => {
    if (p.lots.length === 0) {
      rows.push([p.name, p.barcode, p.category, p.unit, '', '', '', '', '']);
    } else {
      p.lots.forEach(l => {
        rows.push([
          p.name, p.barcode, p.category, p.unit,
          l.qty || '', l.expiry || '', l.price || '',
          l.enteredAt ? l.enteredAt.split('T')[0] : '',
          l.notes || ''
        ]);
      });
    }
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv, 'inventario-stockcontrol.csv', 'text/csv');
}

async function exportExpiryCSV() {
  const lots = await DB.getExpiryReport(60); // próximos 60 días + vencidos
  const rows = [['Producto','Código','Categoría','Cantidad','Vencimiento','Días restantes','Estado']];

  lots.forEach(l => {
    const days = l.daysLeft;
    const estado = days < 0 ? 'VENCIDO' : days <= 7 ? 'CRÍTICO' : days <= 30 ? 'PRÓXIMO' : 'OK';
    rows.push([
      l.product.name || '', l.barcode || '', l.product.category || '',
      l.qty, l.expiry, days, estado
    ]);
  });

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv, 'vencimientos-stockcontrol.csv', 'text/csv');
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Modal ────────────────────────────────────────────────────────

function initModal() {
  $('btn-modal-close').addEventListener('click', () => $('modal-detail').classList.add('hidden'));
  $('modal-detail').addEventListener('click', e => {
    if (e.target === $('modal-detail')) $('modal-detail').classList.add('hidden');
  });
}

// ─── Main init ────────────────────────────────────────────────────

async function initApp() {
  initNav();
  initModal();
  await initScanner();
  await loadInventory();

  // Filter listeners
  $('inv-search').addEventListener('input', loadInventory);
  $('inv-cat-filter').addEventListener('change', loadInventory);
  $('exp-filter').addEventListener('change', loadExpiry);

  // Export buttons
  $('btn-export-csv').addEventListener('click', exportCSV);
  $('btn-export-exp').addEventListener('click', exportExpiryCSV);
}

// ─── Boot ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initAuth);
