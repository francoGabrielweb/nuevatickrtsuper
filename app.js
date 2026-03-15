/**
 * app.js — StockControl
 * Modelo correcto: 1 producto → N lotes independientes, cada uno con fecha y cantidad propia
 */

// ── Helpers ───────────────────────────────────────────────────────

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const s = iso.split('T')[0]; // yyyy-mm-dd
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
       + ' ' + d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
}

function daysLeft(expStr) {
  if (!expStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp   = new Date(expStr + 'T00:00:00');
  return Math.floor((exp - today) / 86400000);
}

function expiryBadge(days) {
  if (days === null)  return '<span class="badge badge-info">Sin fecha</span>';
  if (days < 0)       return `<span class="badge badge-danger">Vencido hace ${Math.abs(days)}d</span>`;
  if (days === 0)     return `<span class="badge badge-danger">Vence HOY</span>`;
  if (days <= 7)      return `<span class="badge badge-danger">Vence en ${days}d</span>`;
  if (days <= 30)     return `<span class="badge badge-warn">Vence en ${days}d</span>`;
  return `<span class="badge badge-ok">${days}d restantes</span>`;
}

function initials(name) {
  return name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';
}

// ── Auth ──────────────────────────────────────────────────────────

async function initAuth() {
  if (AUTH.isAuthenticated()) { startApp(); return; }

  $('login-screen').classList.remove('hidden');
  $('app').classList.add('hidden');

  const doLogin = async () => {
    const u = $('inp-user').value.trim();
    const p = $('inp-pass').value;
    if (!u || !p) return;
    $('btn-login').disabled = true;
    $('btn-login').textContent = 'Verificando...';
    const r = await AUTH.login(u, p);
    $('btn-login').disabled = false;
    $('btn-login').textContent = 'Ingresar';
    if (r.ok) { $('login-screen').classList.add('hidden'); startApp(); }
    else {
      const el = $('login-error');
      el.textContent = r.error;
      el.classList.remove('hidden');
      $('inp-pass').value = '';
      setTimeout(() => el.classList.add('hidden'), 5000);
    }
  };

  $('btn-login').addEventListener('click', doLogin);
  $('inp-pass').addEventListener('keydown', e => e.key === 'Enter' && doLogin());
  $('inp-user').addEventListener('keydown', e => e.key === 'Enter' && $('inp-pass').focus());
}

// ── Navigation ────────────────────────────────────────────────────

const SECTIONS = {
  scan:      () => {},
  inventory: loadInventory,
  expiry:    loadExpiry,
  reports:   loadReports
};

function initNav() {
  document.querySelectorAll('.nav-item[data-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.sec;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      $('sec-' + sec).classList.add('active');
      if (SECTIONS[sec]) SECTIONS[sec]();
    });
  });
}

// ── Scanner ───────────────────────────────────────────────────────

let camStream   = null;
let camInterval = null;
let lastCode    = null;
let barcodeDetector = null;

function initScanner() {
  if (!('BarcodeDetector' in window)) {
    $('scanner-status').textContent = 'BarcodeDetector no disponible — usá el campo manual';
    $('btn-cam-start').disabled = true;
    $('btn-cam-start').textContent = 'No disponible en este navegador';
  } else {
    barcodeDetector = new BarcodeDetector({
      formats: ['ean_13','ean_8','code_128','code_39','code_93','upc_a','upc_e','qr_code','itf','codabar']
    });
  }

  $('btn-cam-start').addEventListener('click', startCam);
  $('btn-cam-stop').addEventListener('click', stopCam);
  $('btn-manual').addEventListener('click', () => {
    const code = $('inp-barcode').value.trim();
    if (code) handleCode(code);
  });
  $('inp-barcode').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const code = $('inp-barcode').value.trim();
      if (code) handleCode(code);
    }
  });
}

async function startCam() {
  try {
    $('scanner-status').textContent = 'Solicitando cámara...';
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
    });
    const video = $('scanner-video');
    video.srcObject = camStream;
    await video.play();

    $('btn-cam-start').classList.add('hidden');
    $('btn-cam-stop').classList.remove('hidden');
    $('scanner-status').textContent = 'Apuntá al código de barras';

    if (barcodeDetector) {
      camInterval = setInterval(async () => {
        try {
          const codes = await barcodeDetector.detect(video);
          if (codes.length > 0) {
            const code = codes[0].rawValue;
            if (code !== lastCode) {
              lastCode = code;
              flashDetected();
              handleCode(code);
              setTimeout(() => { lastCode = null; }, 3000);
            }
          }
        } catch(_) {}
      }, 400);
    }
  } catch(e) {
    $('scanner-status').textContent = 'Error: ' + (e.message || 'no se pudo acceder a la cámara');
  }
}

function stopCam() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  if (camInterval) { clearInterval(camInterval); camInterval = null; }
  $('scanner-video').srcObject = null;
  $('btn-cam-start').classList.remove('hidden');
  $('btn-cam-stop').classList.add('hidden');
  $('scanner-status').textContent = 'Presioná "Iniciar cámara"';
  lastCode = null;
}

function flashDetected() {
  const vp = $('scanner-vp');
  const el = document.createElement('div');
  el.className = 'scanner-flash';
  vp.appendChild(el);
  setTimeout(() => el.remove(), 500);
}

async function handleCode(barcode) {
  $('scanner-status').textContent = `Código: ${barcode}`;
  $('inp-barcode').value = barcode;

  // Hide all panels
  $('panel-empty').classList.add('hidden');
  $('panel-existing').classList.add('hidden');
  $('panel-new').classList.add('hidden');

  const result = await DB.getProductWithLots(barcode);
  if (result) {
    renderExistingPanel(result.product, result.lots);
  } else {
    renderNewPanel(barcode);
  }
}

// ── Existing product panel ────────────────────────────────────────

function renderExistingPanel(product, lots) {
  $('panel-existing').classList.remove('hidden');

  $('ex-icon').textContent = initials(product.name);
  $('ex-name').textContent = product.name;
  $('ex-code').textContent = product.barcode;

  // Pills — all current lots ordered by expiry
  const sorted = [...lots].sort((a, b) => {
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });

  const pillsEl = $('ex-lots-pills');
  if (sorted.length === 0) {
    pillsEl.innerHTML = '<span style="font-size:12px;color:var(--text3)">Sin lotes registrados</span>';
  } else {
    pillsEl.innerHTML = sorted.map(l => {
      const days = daysLeft(l.expiry);
      const color = days === null ? '' : days < 0 ? 'color:var(--red)' : days <= 7 ? 'color:var(--red)' : days <= 30 ? 'color:var(--amber)' : 'color:var(--green)';
      return `<span class="lot-pill">
        <span class="lot-pill-qty">${l.qty} ${product.unit}(s)</span>
        <span class="lot-pill-date" style="${color}">${l.expiry ? fmtDate(l.expiry) : 'sin fecha'}</span>
      </span>`;
    }).join('');
  }

  // History list
  renderLotHistory(product, sorted);

  // Reset form
  $('ex-qty').value = 1;
  $('ex-exp').value = '';
  $('ex-price').value = '';
  $('ex-notes').value = '';

  $('btn-add-lot').onclick = async () => {
    const qty = parseInt($('ex-qty').value) || 0;
    if (qty < 1) { toast('Ingresá una cantidad válida', 'error'); return; }

    $('btn-add-lot').disabled = true;
    await DB.addLot({
      productId: product.id,
      barcode: product.barcode,
      qty,
      expiry: $('ex-exp').value || null,
      price: parseFloat($('ex-price').value) || null,
      notes: $('ex-notes').value.trim()
    });
    $('btn-add-lot').disabled = false;

    toast(`Ingreso registrado: ${qty} ${product.unit}(s) de ${product.name}`, 'success');

    // Refresh panel
    const updated = await DB.getProductWithLots(product.barcode);
    if (updated) renderExistingPanel(updated.product, updated.lots);
  };
}

function renderLotHistory(product, lots) {
  $('ex-lots-count').textContent = `${lots.length} lotes`;
  const list = $('ex-lots-list');

  if (lots.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:1.5rem"><p>Sin lotes</p></div>';
    return;
  }

  list.innerHTML = lots.map(l => {
    const days = daysLeft(l.expiry);
    return `
      <div class="lot-row">
        <div class="lot-top">
          <div>
            <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.4px;font-weight:600">Ingreso</div>
            <div style="font-size:13px;color:var(--text2)">${fmtDateTime(l.enteredAt)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:20px;font-weight:700;line-height:1">${l.qty}</div>
            <div style="font-size:11px;color:var(--text2)">${esc(product.unit)}(s)</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div style="font-size:13px;color:var(--text2)">
            Vto: <strong style="color:var(--text)">${l.expiry ? fmtDate(l.expiry) : '—'}</strong>
          </div>
          ${expiryBadge(days)}
          ${l.price ? `<span style="font-size:12px;color:var(--text2)">$${l.price}</span>` : ''}
          ${l.notes ? `<span style="font-size:11px;color:var(--text3);font-style:italic">${esc(l.notes)}</span>` : ''}
          <button class="lot-delete" data-lot-id="${l.id}" title="Eliminar lote" style="margin-left:auto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.lot-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este lote?')) return;
      await DB.deleteLot(Number(btn.dataset.lotId));
      toast('Lote eliminado');
      const updated = await DB.getProductWithLots(product.barcode);
      if (updated) renderExistingPanel(updated.product, updated.lots);
    });
  });
}

// ── New product panel ─────────────────────────────────────────────

function renderNewPanel(barcode) {
  $('panel-new').classList.remove('hidden');
  $('new-code').textContent = barcode;
  $('new-name').value = '';
  $('new-qty').value = 1;
  $('new-exp').value = '';
  $('new-price').value = '';

  $('btn-register-new').onclick = async () => {
    const name = $('new-name').value.trim();
    if (!name) { toast('El nombre es obligatorio', 'error'); return; }
    const qty = parseInt($('new-qty').value) || 1;

    $('btn-register-new').disabled = true;
    const productId = await DB.addProduct({
      barcode,
      name,
      category: $('new-cat').value,
      unit:     $('new-unit').value
    });

    await DB.addLot({
      productId,
      barcode,
      qty,
      expiry: $('new-exp').value || null,
      price:  parseFloat($('new-price').value) || null,
      notes: ''
    });
    $('btn-register-new').disabled = false;

    toast(`Producto registrado: ${name}`, 'success');
    const result = await DB.getProductWithLots(barcode);
    if (result) {
      $('panel-new').classList.add('hidden');
      renderExistingPanel(result.product, result.lots);
    }
  };
}

// ── Inventory ─────────────────────────────────────────────────────

async function loadInventory() {
  const all    = await DB.getAllInventory();
  const search = $('inv-search').value.toLowerCase();
  const cat    = $('inv-cat').value;

  const filtered = all.filter(p =>
    (!search || p.name.toLowerCase().includes(search) || p.barcode.includes(search)) &&
    (!cat    || p.category === cat)
  );

  // Metrics
  const totalUnits = all.reduce((s, p) => s + p.lots.reduce((ls, l) => ls + (l.qty||0), 0), 0);
  let exp7 = 0, expPast = 0;
  all.forEach(p => p.lots.forEach(l => {
    const d = daysLeft(l.expiry);
    if (d === null) return;
    if (d < 0)      expPast++;
    else if (d <= 7) exp7++;
  }));

  $('inv-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Productos</div><div class="metric-value">${all.length}</div></div>
    <div class="metric"><div class="metric-label">Unidades</div><div class="metric-value">${totalUnits}</div></div>
    <div class="metric"><div class="metric-label">Vencen 7d</div><div class="metric-value ${exp7>0?'amber':''}">${exp7}</div></div>
    <div class="metric"><div class="metric-label">Vencidos</div><div class="metric-value ${expPast>0?'red':''}">${expPast}</div></div>
  `;

  const list = $('inv-list');
  if (filtered.length === 0) {
    list.innerHTML = '';
    $('inv-empty').classList.remove('hidden');
    return;
  }
  $('inv-empty').classList.add('hidden');

  list.innerHTML = filtered.map(p => {
    const totalQty = p.lots.reduce((s, l) => s + (l.qty||0), 0);
    const upcoming = p.lots.filter(l => l.expiry).sort((a,b) => a.expiry.localeCompare(b.expiry));
    const nextExp  = upcoming[0] || null;
    const days     = nextExp ? daysLeft(nextExp.expiry) : null;

    let statusBadge = '';
    if (days === null) statusBadge = '<span class="badge badge-info">Sin fecha</span>';
    else if (days < 0)  statusBadge = '<span class="badge badge-danger">Vencido</span>';
    else if (days <= 7) statusBadge = `<span class="badge badge-danger">${days}d</span>`;
    else if (days <= 30) statusBadge = `<span class="badge badge-warn">${days}d</span>`;
    else statusBadge = `<span class="badge badge-ok">OK</span>`;

    return `
      <div class="product-row" data-product-id="${p.id}">
        <div class="p-icon">${esc(initials(p.name))}</div>
        <div class="p-info">
          <div class="p-name">${esc(p.name)}</div>
          <div class="p-meta">${esc(p.category)} · ${p.lots.length} lote${p.lots.length!==1?'s':''} · ${statusBadge}</div>
        </div>
        <div class="p-right">
          <div class="p-qty">${totalQty}</div>
          <div class="p-unit">${esc(p.unit)}(s)</div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.product-row').forEach(row => {
    row.addEventListener('click', () => {
      const p = filtered.find(x => x.id === Number(row.dataset.productId));
      if (p) openSheet(p);
    });
  });
}

// ── Product detail bottom sheet ───────────────────────────────────

function openSheet(product) {
  $('sh-name').textContent = product.name;
  $('sh-code').textContent = product.barcode;
  $('sh-cat').innerHTML = `<span class="badge badge-info">${esc(product.category)}</span>`;

  const lots = [...product.lots].sort((a, b) => {
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return a.expiry.localeCompare(b.expiry);
  });

  const totalQty = lots.reduce((s, l) => s + (l.qty||0), 0);
  const expired  = lots.filter(l => l.expiry && daysLeft(l.expiry) < 0).length;
  const critical = lots.filter(l => { const d = daysLeft(l.expiry); return d !== null && d >= 0 && d <= 7; }).length;

  let html = `
    <div class="sheet-stat-row">
      <div class="sheet-stat"><div class="sheet-stat-label">Total unidades</div><div class="sheet-stat-value">${totalQty} ${esc(product.unit)}(s)</div></div>
      <div class="sheet-stat"><div class="sheet-stat-label">Lotes</div><div class="sheet-stat-value">${lots.length}</div></div>
    </div>
  `;

  if (expired > 0 || critical > 0) {
    html += `<div style="background:var(--red-bg);border-radius:var(--r-sm);padding:.75rem 1rem;margin-bottom:1rem;font-size:13px;color:var(--red-text)">
      ⚠️ ${expired > 0 ? `${expired} lote(s) vencido(s). ` : ''}${critical > 0 ? `${critical} lote(s) vencen en 7 días.` : ''}
    </div>`;
  }

  html += `<div class="sheet-section-title">Todos los lotes (${lots.length})</div>`;

  if (lots.length === 0) {
    html += '<p style="font-size:13px;color:var(--text3)">Sin lotes registrados.</p>';
  } else {
    html += lots.map((l, i) => {
      const days = daysLeft(l.expiry);
      const border = days !== null && days < 0 ? 'border-left:3px solid var(--red);' : days !== null && days <= 7 ? 'border-left:3px solid var(--amber);' : 'border-left:3px solid var(--border2);';
      return `
        <div style="padding:.875rem;background:var(--surface2);border-radius:var(--r-sm);margin-bottom:8px;${border}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
            <div>
              <div style="font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px">Lote #${i+1}</div>
              <div style="font-size:18px;font-weight:700;line-height:1.2">${l.qty} <span style="font-size:13px;font-weight:500;color:var(--text2)">${esc(product.unit)}(s)</span></div>
            </div>
            <div style="text-align:right">
              ${expiryBadge(days)}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div>
              <div style="color:var(--text2)">Vencimiento</div>
              <div style="font-weight:600">${l.expiry ? fmtDate(l.expiry) : '—'}</div>
            </div>
            <div>
              <div style="color:var(--text2)">Ingresó el</div>
              <div style="font-weight:600">${fmtDate(l.enteredAt)}</div>
            </div>
            ${l.price ? `<div><div style="color:var(--text2)">Costo</div><div style="font-weight:600">$${l.price}</div></div>` : ''}
            ${l.notes ? `<div style="grid-column:1/-1"><div style="color:var(--text2)">Nota</div><div style="font-style:italic">${esc(l.notes)}</div></div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  $('sh-body').innerHTML = html;
  $('sheet-backdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  $('sheet-backdrop').classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Expiry ────────────────────────────────────────────────────────

let currentExpDays = 7;

function initExpChips() {
  $('exp-chips').querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $('exp-chips').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentExpDays = Number(chip.dataset.days);
      loadExpiry();
    });
  });
}

async function loadExpiry() {
  const lots = await DB.getExpiryReport(currentExpDays);

  const expired  = lots.filter(l => l.daysLeft !== null && l.daysLeft < 0).length;
  const today7   = lots.filter(l => l.daysLeft !== null && l.daysLeft >= 0 && l.daysLeft <= 7).length;
  const totalQty = lots.reduce((s, l) => s + (l.qty||0), 0);

  $('exp-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Lotes</div><div class="metric-value">${lots.length}</div></div>
    <div class="metric"><div class="metric-label">Unidades</div><div class="metric-value">${totalQty}</div></div>
    <div class="metric"><div class="metric-label">Vencidos</div><div class="metric-value ${expired>0?'red':''}">${expired}</div></div>
    <div class="metric"><div class="metric-label">Críticos 7d</div><div class="metric-value ${today7>0?'amber':''}">${today7}</div></div>
  `;

  const list = $('exp-list');
  if (lots.length === 0) {
    list.innerHTML = '';
    $('exp-empty').classList.remove('hidden');
    return;
  }
  $('exp-empty').classList.add('hidden');

  list.innerHTML = lots.map(l => {
    const days  = l.daysLeft;
    const badge = expiryBadge(days);
    const daysStr = days === null ? '—' : days < 0
      ? `<span style="font-size:15px;font-weight:700;color:var(--red)">${Math.abs(days)}d vencido</span>`
      : days === 0
        ? `<span style="font-size:15px;font-weight:700;color:var(--red)">HOY</span>`
        : `<span style="font-size:15px;font-weight:700;color:${days<=7?'var(--red)':days<=30?'var(--amber)':'var(--green)'}">${days}d</span>`;

    return `
      <div class="lot-row">
        <div class="lot-top">
          <div>
            <div style="font-size:14px;font-weight:600">${esc(l.product.name || '—')}</div>
            <div style="font-size:12px;color:var(--text2)">${esc(l.product.category || '')} · ingresó ${fmtDate(l.enteredAt)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:17px;font-weight:700">${l.qty} <span style="font-size:12px;font-weight:500;color:var(--text2)">${esc(l.product.unit||'u')}(s)</span></div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;color:var(--text2)">Vto: <strong>${l.expiry ? fmtDate(l.expiry) : '—'}</strong></span>
          ${badge}
          <span style="margin-left:auto">${daysStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Reports ───────────────────────────────────────────────────────

async function loadReports() {
  const inventory = await DB.getAllInventory();
  const allLots   = await DB.getAllLots();

  const totalQty  = allLots.reduce((s, l) => s + (l.qty||0), 0);
  const critLots  = allLots.filter(l => { const d = daysLeft(l.expiry); return d !== null && d <= 7; });

  $('rep-metrics').innerHTML = `
    <div class="metric"><div class="metric-label">Productos</div><div class="metric-value">${inventory.length}</div></div>
    <div class="metric"><div class="metric-label">Lotes totales</div><div class="metric-value">${allLots.length}</div></div>
    <div class="metric"><div class="metric-label">Unidades stock</div><div class="metric-value">${totalQty}</div></div>
    <div class="metric"><div class="metric-label">Lotes críticos</div><div class="metric-value ${critLots.length>0?'red':''}">${critLots.length}</div></div>
  `;

  // By category
  const catMap = {};
  inventory.forEach(p => {
    const k = p.category || 'Sin categoría';
    catMap[k] = (catMap[k] || 0) + 1;
  });
  const maxCat = Math.max(...Object.values(catMap), 1);
  $('rep-cats').innerHTML = Object.entries(catMap).sort((a,b) => b[1]-a[1]).map(([cat, n]) => `
    <div class="rep-row">
      <span class="rep-name">${esc(cat)}</span>
      <div class="rep-bar-wrap"><div class="rep-bar" style="width:${Math.round(n/maxCat*100)}%"></div></div>
      <span class="rep-num">${n}</span>
    </div>
  `).join('') || '<div class="empty-state" style="padding:1.5rem"><p>Sin datos</p></div>';

  // Critical lots
  const pMap = {};
  inventory.forEach(p => pMap[p.id] = p);
  const crits = allLots
    .filter(l => { const d = daysLeft(l.expiry); return d !== null && d <= 7; })
    .map(l => ({ ...l, product: pMap[l.productId] || {}, days: daysLeft(l.expiry) }))
    .sort((a,b) => a.days - b.days);

  $('rep-critical').innerHTML = crits.length === 0
    ? '<div class="empty-state" style="padding:1.5rem"><p>✓ Sin lotes críticos</p></div>'
    : crits.map(l => `
      <div class="critical-row">
        <div class="critical-info">
          <div class="critical-name">${esc(l.product.name || '—')}</div>
          <div class="critical-meta">${esc(l.product.category || '')} · Vto: ${l.expiry ? fmtDate(l.expiry) : '—'}</div>
        </div>
        <div class="critical-right">
          <div class="critical-days">${l.days < 0 ? `${Math.abs(l.days)}d vencido` : l.days === 0 ? 'HOY' : `${l.days}d`}</div>
          <div class="critical-qty">${l.qty} u.</div>
        </div>
      </div>
    `).join('');

  // Recent lots
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = allLots
    .filter(l => l.enteredAt >= cutoff)
    .sort((a,b) => b.enteredAt.localeCompare(a.enteredAt))
    .slice(0, 15);

  $('rep-recent').innerHTML = recent.length === 0
    ? '<div class="empty-state" style="padding:1.5rem"><p>Sin ingresos en 30 días</p></div>'
    : recent.map(l => {
        const p = pMap[l.productId];
        return `
          <div class="lot-row" style="padding:.75rem 1rem">
            <div class="lot-top">
              <div>
                <div style="font-size:14px;font-weight:600">${p ? esc(p.name) : '—'}</div>
                <div style="font-size:12px;color:var(--text2)">${fmtDateTime(l.enteredAt)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:16px;font-weight:700">${l.qty} <span style="font-size:11px;color:var(--text2)">${p ? esc(p.unit) : ''}(s)</span></div>
                ${l.expiry ? `<div style="font-size:12px;color:var(--text2)">Vto: ${fmtDate(l.expiry)}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
}

// ── CSV Export ────────────────────────────────────────────────────

async function exportFullCSV() {
  const inv = await DB.getAllInventory();
  const rows = [['Producto','Código','Categoría','Unidad','Cantidad lote','Vencimiento','Precio','Fecha ingreso','Notas']];
  inv.forEach(p => {
    if (p.lots.length === 0) {
      rows.push([p.name, p.barcode, p.category, p.unit, '', '', '', '', '']);
    } else {
      p.lots.forEach(l => rows.push([
        p.name, p.barcode, p.category, p.unit,
        l.qty || '', l.expiry || '', l.price || '',
        l.enteredAt ? l.enteredAt.split('T')[0] : '', l.notes || ''
      ]));
    }
  });
  dlCSV(rows, 'inventario-stockcontrol.csv');
}

function dlCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Boot ──────────────────────────────────────────────────────────

function startApp() {
  $('app').classList.remove('hidden');
  initNav();
  initScanner();
  initExpChips();

  // Inventory search/filter
  $('inv-search').addEventListener('input', loadInventory);
  $('inv-cat').addEventListener('change', loadInventory);

  // Sheet close
  $('btn-sheet-close').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', e => {
    if (e.target === $('sheet-backdrop')) closeSheet();
  });

  // Exports
  $('btn-exp-csv').addEventListener('click', exportFullCSV);
  $('btn-full-csv').addEventListener('click', exportFullCSV);

  // Logout
  $('btn-logout-nav').addEventListener('click', () => {
    if (confirm('¿Cerrar sesión?')) { AUTH.logout(); location.reload(); }
  });

  // Load initial
  loadInventory();
}

document.addEventListener('DOMContentLoaded', initAuth);
