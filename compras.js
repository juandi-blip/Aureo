// AUREO — Módulo de Compras a Proveedores
// Solicitud de pedido (análisis de punto de reorden + manual), generación de
// órdenes de compra con consecutivo automático y consulta por proveedor.
// Persistencia: localStorage, semilla desde DEMO_DATA.buildCompras().

// ==========================================================================
//   ESTADO Y PERSISTENCIA
// ==========================================================================

const COMPRAS_LS = {
    solicitudes: 'aureo_compras_solicitudes',
    ocs: 'aureo_compras_ocs',
    matprov: 'aureo_compras_matprov',
    seq: 'aureo_compras_oc_seq',
    descartes: 'aureo_compras_descartes'
};

let comprasState = {
    solicitudes: [],
    ocs: [],
    productSuppliers: {},
    ocSeq: 4508,
    descartes: []
};
let _comprasLoaded = false;
let activeComprasSub = null;
let _comprasSel = new Set();
let _comprasOcOpen = new Set();
let _comprasConsultaProv = '';

function loadComprasState() {
    if (_comprasLoaded) return;
    const raw = localStorage.getItem(COMPRAS_LS.solicitudes);
    if (raw) {
        comprasState.solicitudes = JSON.parse(raw);
        comprasState.ocs = JSON.parse(localStorage.getItem(COMPRAS_LS.ocs) || '[]');
        comprasState.productSuppliers = JSON.parse(localStorage.getItem(COMPRAS_LS.matprov) || '{}');
        comprasState.ocSeq = parseInt(localStorage.getItem(COMPRAS_LS.seq) || '4508', 10);
        comprasState.descartes = JSON.parse(localStorage.getItem(COMPRAS_LS.descartes) || '[]');
    } else if (typeof DEMO_DATA !== 'undefined' && DEMO_DATA.buildCompras) {
        const seed = DEMO_DATA.buildCompras(new Date());
        comprasState.solicitudes = seed.solicitudes;
        comprasState.ocs = seed.ocs;
        comprasState.productSuppliers = seed.productSuppliers;
        comprasState.ocSeq = seed.nextOcSeq;
        comprasState.descartes = [];
        saveComprasState();
    }
    _comprasLoaded = true;
}

function saveComprasState() {
    localStorage.setItem(COMPRAS_LS.solicitudes, JSON.stringify(comprasState.solicitudes));
    localStorage.setItem(COMPRAS_LS.ocs, JSON.stringify(comprasState.ocs));
    localStorage.setItem(COMPRAS_LS.matprov, JSON.stringify(comprasState.productSuppliers));
    localStorage.setItem(COMPRAS_LS.seq, String(comprasState.ocSeq));
    localStorage.setItem(COMPRAS_LS.descartes, JSON.stringify(comprasState.descartes));
}

// ==========================================================================
//   HELPERS
// ==========================================================================

function comprasProduct(pid) {
    return state.products.find(p => p.id === pid);
}

// Costo estimado de compra: ~62% del precio de venta
function comprasCost(p) {
    return p ? Math.round(p.price * 62) / 100 : 0;
}

function comprasSuppliersFor(pid) {
    const arr = comprasState.productSuppliers[pid];
    if (arr && arr.length) return arr;
    const p = comprasProduct(pid);
    return p && p.supplier ? [p.supplier] : [];
}

function comprasFmt(n) {
    const sym = (state.settings && state.settings.currencySymbol) || '$';
    return sym + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function comprasToday() {
    return new Date().toISOString().split('T')[0];
}

function comprasNextSolId() {
    const max = comprasState.solicitudes.reduce((m, s) => {
        const n = parseInt(String(s.id).replace('SOL-', ''), 10);
        return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return 'SOL-' + String(max + 1).padStart(4, '0');
}

function comprasAllSupplierNames() {
    const names = new Set((state.suppliers || []).map(s => s.name));
    Object.values(comprasState.productSuppliers).forEach(arr => arr.forEach(n => names.add(n)));
    (state.products || []).forEach(p => { if (p.supplier) names.add(p.supplier); });
    return [...names].sort();
}

// Opciones de proveedor para un producto: primero los asociados y luego el
// resto del catálogo, para poder comprarle a un proveedor nuevo.
function comprasProvOptionsHtml(pid, selected) {
    const asociados = comprasSuppliersFor(pid);
    const otros = comprasAllSupplierNames().filter(n => !asociados.includes(n));
    const opt = name => `<option value="${name}"${name === selected ? ' selected' : ''}>${name}</option>`;
    let html = '';
    if (asociados.length) html += `<optgroup label="Proveedores del producto">${asociados.map(opt).join('')}</optgroup>`;
    if (otros.length) html += `<optgroup label="Otros proveedores">${otros.map(opt).join('')}</optgroup>`;
    return html || '<option value="">—</option>';
}

// Si el proveedor no está asociado al producto, registra la asociación
// (queda visible en Consulta por Proveedor y persiste en localStorage).
function comprasEnsureSupplierAssigned(pid, prov) {
    if (!prov) return;
    const actuales = comprasSuppliersFor(pid);
    if (actuales.includes(prov)) return;
    comprasState.productSuppliers[pid] = [...actuales, prov];
    saveComprasState();
    triggerToast('success', `${prov} quedó asociado al producto ID ${pid}.`);
}

// Analiza los productos y agrega automáticamente los que están en o por
// debajo del punto de reorden (threshold) como pedidos sugeridos.
function syncComprasSugerencias() {
    let added = 0;
    (state.products || []).forEach(p => {
        if (p.stock > p.threshold) return;
        if (comprasState.descartes.includes(p.id)) return;
        const yaSolicitado = comprasState.solicitudes.some(s => s.productId === p.id);
        const enOcPendiente = comprasState.ocs.some(oc =>
            oc.status === 'Pendiente' && oc.items.some(it => it.productId === p.id));
        if (yaSolicitado || enOcPendiente) return;
        comprasState.solicitudes.push({
            id: comprasNextSolId(),
            productId: p.id,
            supplier: comprasSuppliersFor(p.id)[0] || '',
            qty: Math.max(p.threshold * 2 - p.stock, 1),
            origin: 'Automático',
            status: 'pendiente',
            date: comprasToday()
        });
        added++;
    });
    if (added > 0) saveComprasState();
}

// ==========================================================================
//   NAVEGACIÓN DE SUB-PESTAÑAS
// ==========================================================================

const COMPRAS_SUBS = [
    { id: 'solicitud', label: 'Solicitud de Pedido', icon: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>' },
    { id: 'generacion', label: 'Órdenes de Compra', icon: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
    { id: 'consulta', label: 'Consulta por Proveedor', icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' }
];

function renderCompras() {
    loadComprasState();
    const tabsEl = document.getElementById('compras-tabs');
    if (tabsEl.children.length === 0) {
        COMPRAS_SUBS.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = 'dataentry-tab-btn';
            btn.dataset.sub = sub.id;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sub.icon}</svg>${sub.label}`;
            btn.onclick = () => switchComprasSub(sub.id);
            tabsEl.appendChild(btn);
        });
    }
    switchComprasSub(activeComprasSub || COMPRAS_SUBS[0].id);
}

function switchComprasSub(subId) {
    activeComprasSub = subId;
    document.querySelectorAll('#compras-tabs .dataentry-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === subId);
    });
    const renderers = {
        solicitud: renderCompras_Solicitud,
        generacion: renderCompras_Generacion,
        consulta: renderCompras_Consulta
    };
    if (renderers[subId]) renderers[subId]();
}

// ==========================================================================
//   APARTADO 1: SOLICITUD DE PEDIDO
// ==========================================================================

function renderCompras_Solicitud() {
    loadComprasState();
    syncComprasSugerencias();

    const el = document.getElementById('compras-content');
    const pendientes = comprasState.solicitudes.filter(s => s.status === 'pendiente');

    // Agrupar por proveedor
    const grupos = {};
    pendientes.forEach(s => {
        const prov = s.supplier || 'Sin proveedor';
        (grupos[prov] = grupos[prov] || []).push(s);
    });
    const provNames = Object.keys(grupos).sort();

    const selCount = pendientes.filter(s => _comprasSel.has(s.id)).length;
    const selTotal = pendientes.filter(s => _comprasSel.has(s.id))
        .reduce((sum, s) => sum + s.qty * comprasCost(comprasProduct(s.productId)), 0);
    const autoCount = pendientes.filter(s => s.origin === 'Automático').length;

    const bodyRows = provNames.map(prov => {
        const rows = grupos[prov];
        const subtotal = rows.reduce((sum, s) => sum + s.qty * comprasCost(comprasProduct(s.productId)), 0);
        const header = `
        <tr class="compras-group-row">
          <td colspan="8">
            ${prov} &nbsp;·&nbsp; ${rows.length} pedido${rows.length !== 1 ? 's' : ''}
            &nbsp;·&nbsp; Subtotal estimado: ${comprasFmt(subtotal)}
          </td>
        </tr>`;
        const items = rows.map(s => {
            const p = comprasProduct(s.productId);
            if (!p) return '';
            const provOptions = comprasProvOptionsHtml(s.productId, s.supplier);
            const bajoReorden = p.stock <= p.threshold;
            return `
            <tr>
              <td style="text-align:center;">
                <input type="checkbox" ${_comprasSel.has(s.id) ? 'checked' : ''}
                  onchange="comprasToggleSel('${s.id}', this.checked)">
              </td>
              <td>
                <div class="product-meta-info">
                  <span class="product-name">${p.name}</span>
                  <span class="product-sku">ID ${p.id} · ${p.sku}</span>
                </div>
              </td>
              <td>
                <span class="badge ${s.origin === 'Automático' ? 'badge-warning' : 'badge-info'}">${s.origin}</span>
              </td>
              <td style="white-space:nowrap;">
                <span style="${bajoReorden ? 'color: var(--accent-rose, #e05260); font-weight:600;' : ''}">${p.stock}</span>
                <span style="color:var(--text-muted);"> / ${p.threshold}</span>
              </td>
              <td>
                <input type="number" min="1" class="form-input compras-qty-input" value="${s.qty}"
                  onchange="comprasSetQty('${s.id}', this.value)">
              </td>
              <td>
                <select class="form-select compras-prov-select" onchange="comprasSetProv('${s.id}', this.value)">
                  ${provOptions}
                </select>
              </td>
              <td style="white-space:nowrap;">${comprasFmt(comprasCost(p))}</td>
              <td style="text-align:right; white-space:nowrap;">
                <button class="btn btn-secondary btn-sm btn-icon-only" title="Dividir entre dos proveedores"
                  onclick="comprasDividirSolicitud('${s.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                </button>
                <button class="btn btn-danger btn-sm btn-icon-only" title="Eliminar pedido"
                  onclick="comprasDeleteSolicitud('${s.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </td>
            </tr>`;
        }).join('');
        return header + items;
    }).join('');

    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar Pedido Manual
          </span>
        </div>
        <form onsubmit="comprasAddManual(event)">
          <div class="form-row" style="grid-template-columns: 150px 2fr 1fr 110px auto; align-items:end;">
            <div class="form-group">
              <label class="form-label">ID del Producto</label>
              <input type="text" class="form-input" id="compras-sol-id" list="compras-id-list"
                placeholder="Ej: 21" autocomplete="off" oninput="comprasOnIdInput()" required>
              <datalist id="compras-id-list">
                ${[...(state.products || [])].sort((a, b) => Number(a.id) - Number(b.id))
            .map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('')}
              </datalist>
            </div>
            <div class="form-group">
              <label class="form-label">Producto</label>
              <input type="text" class="form-input" id="compras-sol-name" readonly
                placeholder="Se autocompleta con el ID" style="opacity:.75;">
            </div>
            <div class="form-group">
              <label class="form-label">Proveedor</label>
              <select class="form-select" id="compras-sol-prov">
                <option value="">—</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Cantidad</label>
              <input type="number" class="form-input" id="compras-sol-qty" min="1" value="1" required>
            </div>
            <div class="form-group">
              <button type="submit" class="btn btn-primary">Agregar a la Solicitud</button>
            </div>
          </div>
          <p id="compras-sol-info" style="margin:0.25rem 0 0; font-size:0.82rem; color:var(--text-muted);"></p>
        </form>
      </div>

      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>
            Solicitud de Pedido &nbsp;·&nbsp; ${pendientes.length} pendiente${pendientes.length !== 1 ? 's' : ''}
            ${autoCount > 0 ? `&nbsp;<span class="badge badge-warning">${autoCount} bajo punto de reorden</span>` : ''}
          </span>
          <div style="display:flex; gap:0.6rem; align-items:center;">
            ${comprasState.descartes.length > 0 ? `<button class="btn btn-secondary btn-sm" onclick="comprasRestaurarDescartes()">Restaurar sugerencias (${comprasState.descartes.length})</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="comprasExportExcel()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar Excel
            </button>
          </div>
        </div>

        ${pendientes.length === 0 ? `
        <div class="dataentry-placeholder" style="padding:2.5rem 1rem;">
          <h3>Sin pedidos pendientes</h3>
          <p>No hay productos por debajo del punto de reorden ni pedidos manuales.</p>
        </div>` : `
        <div class="table-responsive">
          <table class="custom-table" style="font-size:0.85rem;">
            <thead>
              <tr>
                <th style="width:40px; text-align:center;">
                  <input type="checkbox" ${selCount === pendientes.length && pendientes.length > 0 ? 'checked' : ''}
                    onchange="comprasToggleSelAll(this.checked)" title="Seleccionar todo">
                </th>
                <th>Producto</th>
                <th>Origen</th>
                <th>Stock / Reorden</th>
                <th>Cantidad</th>
                <th>Proveedor</th>
                <th>Costo Unit.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="compras-toolbar">
          <span style="color:var(--text-muted); font-size:0.88rem;">
            ${selCount} seleccionado${selCount !== 1 ? 's' : ''}
            ${selCount > 0 ? ` · Total estimado: <strong style="color:var(--text-primary);">${comprasFmt(selTotal)}</strong>` : ''}
          </span>
          <button class="btn btn-primary" ${selCount === 0 ? 'disabled style="opacity:.45;cursor:not-allowed;"' : ''}
            onclick="comprasAceptarSeleccion()">
            Aceptar Solicitud → Generar Compras
          </button>
        </div>`}
      </div>
    </div>`;

    comprasOnIdInput();
}

// Al ingresar el ID manualmente se autocompleta la etiqueta del producto,
// sus proveedores y la información de stock/costo.
function comprasOnIdInput() {
    const idEl = document.getElementById('compras-sol-id');
    const nameEl = document.getElementById('compras-sol-name');
    const provSel = document.getElementById('compras-sol-prov');
    const infoEl = document.getElementById('compras-sol-info');
    if (!idEl || !nameEl || !provSel) return;
    const pid = idEl.value.trim();
    const p = comprasProduct(pid);
    if (p) {
        nameEl.value = p.name;
        provSel.innerHTML = comprasProvOptionsHtml(p.id, '');
        if (infoEl) infoEl.innerHTML = `SKU ${p.sku} &nbsp;·&nbsp; Stock actual: <strong>${p.stock}</strong> / Reorden: ${p.threshold} &nbsp;·&nbsp; Costo estimado: ${comprasFmt(comprasCost(p))}`;
    } else {
        nameEl.value = '';
        provSel.innerHTML = '<option value="">—</option>';
        if (infoEl) infoEl.textContent = pid ? `No existe un producto con ID ${pid}.` : '';
    }
}

function comprasAddManual(event) {
    event.preventDefault();
    const pid = document.getElementById('compras-sol-id').value.trim();
    const qty = parseInt(document.getElementById('compras-sol-qty').value, 10);
    const prov = document.getElementById('compras-sol-prov').value;
    if (!comprasProduct(pid)) {
        triggerToast('error', `No existe un producto con ID ${pid || '—'}.`);
        return;
    }
    if (!prov || !qty || qty < 1) return;
    comprasEnsureSupplierAssigned(pid, prov);
    comprasState.solicitudes.push({
        id: comprasNextSolId(),
        productId: pid,
        supplier: prov,
        qty: qty,
        origin: 'Manual',
        status: 'pendiente',
        date: comprasToday()
    });
    saveComprasState();
    triggerToast('success', 'Pedido agregado a la solicitud.');
    renderCompras_Solicitud();
}

function comprasToggleSel(solId, checked) {
    if (checked) _comprasSel.add(solId); else _comprasSel.delete(solId);
    renderCompras_Solicitud();
}

function comprasToggleSelAll(checked) {
    _comprasSel.clear();
    if (checked) {
        comprasState.solicitudes.filter(s => s.status === 'pendiente').forEach(s => _comprasSel.add(s.id));
    }
    renderCompras_Solicitud();
}

function comprasSetQty(solId, value) {
    const s = comprasState.solicitudes.find(x => x.id === solId);
    const qty = parseInt(value, 10);
    if (s && qty > 0) { s.qty = qty; saveComprasState(); }
    renderCompras_Solicitud();
}

function comprasSetProv(solId, prov) {
    const s = comprasState.solicitudes.find(x => x.id === solId);
    if (s) {
        s.supplier = prov;
        comprasEnsureSupplierAssigned(s.productId, prov);
        saveComprasState();
    }
    renderCompras_Solicitud();
}

function comprasDeleteSolicitud(solId) {
    const s = comprasState.solicitudes.find(x => x.id === solId);
    if (!s) return;
    // Los sugeridos eliminados se descartan para que el análisis no los re-agregue
    if (s.origin === 'Automático' && !comprasState.descartes.includes(s.productId)) {
        comprasState.descartes.push(s.productId);
    }
    comprasState.solicitudes = comprasState.solicitudes.filter(x => x.id !== solId);
    _comprasSel.delete(solId);
    saveComprasState();
    renderCompras_Solicitud();
}

// Divide una solicitud pendiente en dos líneas para pedir el mismo
// producto a dos proveedores distintos.
function comprasDividirSolicitud(solId) {
    const s = comprasState.solicitudes.find(x => x.id === solId);
    if (!s || s.status !== 'pendiente') return;
    if (s.qty < 2) {
        triggerToast('error', 'La cantidad debe ser 2 o más para dividir el pedido.');
        return;
    }
    const mitad = Math.floor(s.qty / 2);
    s.qty -= mitad;
    const otroProv = comprasSuppliersFor(s.productId).find(n => n !== s.supplier) || s.supplier;
    comprasState.solicitudes.push({
        id: comprasNextSolId(),
        productId: s.productId,
        supplier: otroProv,
        qty: mitad,
        origin: 'Manual',
        status: 'pendiente',
        date: comprasToday()
    });
    saveComprasState();
    triggerToast('success', 'Pedido dividido en dos líneas. Ajusta proveedor y cantidades si es necesario.');
    renderCompras_Solicitud();
}

function comprasRestaurarDescartes() {
    comprasState.descartes = [];
    saveComprasState();
    renderCompras_Solicitud();
}

function comprasExportExcel() {
    const pendientes = comprasState.solicitudes.filter(s => s.status === 'pendiente');
    if (pendientes.length === 0) {
        triggerToast('error', 'No hay pedidos pendientes para exportar.');
        return;
    }
    if (typeof XLSX === 'undefined') {
        triggerToast('error', 'Librería de Excel no disponible.');
        return;
    }
    const rows = [...pendientes]
        .sort((a, b) => (a.supplier || '').localeCompare(b.supplier || ''))
        .map(s => {
            const p = comprasProduct(s.productId) || {};
            const cost = comprasCost(p);
            return {
                'Proveedor': s.supplier,
                'ID Producto': s.productId,
                'Producto': p.name || '',
                'SKU': p.sku || '',
                'Origen': s.origin,
                'Stock Actual': p.stock,
                'Punto de Reorden': p.threshold,
                'Cantidad Solicitada': s.qty,
                'Costo Unitario': cost,
                'Subtotal': Math.round(s.qty * cost * 100) / 100,
                'Fecha': s.date
            };
        });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 11 }, { wch: 45 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 15 }, { wch: 17 }, { wch: 13 }, { wch: 12 }, { wch: 11 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitud de Pedido');
    XLSX.writeFile(wb, `solicitud-pedido-${comprasToday()}.xlsx`);
    triggerToast('success', 'Solicitud exportada a Excel.');
}

function comprasAceptarSeleccion() {
    const seleccionados = comprasState.solicitudes.filter(s => s.status === 'pendiente' && _comprasSel.has(s.id));
    if (seleccionados.length === 0) return;
    seleccionados.forEach(s => { s.status = 'aceptado'; s.acceptedDate = comprasToday(); });
    _comprasSel.clear();
    saveComprasState();
    triggerToast('success', `${seleccionados.length} pedido(s) aceptado(s). Listos para generar OC.`);
    switchComprasSub('generacion');
}

// ==========================================================================
//   APARTADO 2: GENERACIÓN DE ÓRDENES DE COMPRA
// ==========================================================================

function renderCompras_Generacion() {
    loadComprasState();
    const el = document.getElementById('compras-content');

    const aceptadas = comprasState.solicitudes.filter(s => s.status === 'aceptado');
    const grupos = {};
    aceptadas.forEach(s => {
        const prov = s.supplier || 'Sin proveedor';
        (grupos[prov] = grupos[prov] || []).push(s);
    });
    const provNames = Object.keys(grupos).sort();

    const genHtml = provNames.length === 0 ? `
      <div class="dataentry-placeholder" style="padding:2rem 1rem;">
        <h3>Sin solicitudes aceptadas</h3>
        <p>Acepta pedidos en "Solicitud de Pedido" para generar órdenes de compra.</p>
      </div>` : `
      <p style="color:var(--text-muted); font-size:0.88rem; margin-top:0.75rem;">
        Próximo consecutivo: <strong style="color:var(--text-primary);">OC-${comprasState.ocSeq}</strong>
        &nbsp;·&nbsp; Se genera una orden por proveedor.
      </p>
      ${provNames.map(prov => {
        const rows = grupos[prov];
        const total = rows.reduce((sum, s) => sum + s.qty * comprasCost(comprasProduct(s.productId)), 0);
        return `
        <div class="table-responsive" style="margin-top:1rem;">
          <table class="custom-table" style="font-size:0.85rem;">
            <thead>
              <tr>
                <th colspan="2">${prov}</th>
                <th style="text-align:right;">Total estimado: ${comprasFmt(total)}</th>
                <th style="text-align:right; width:220px;">
                  <button class="btn btn-primary btn-sm" onclick="comprasGenerarOC('${prov.replace(/'/g, "\\'")}')">
                    Generar Orden de Compra
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(s => {
            const p = comprasProduct(s.productId) || {};
            return `
              <tr>
                <td>
                  <div class="product-meta-info">
                    <span class="product-name">${p.name || s.productId}</span>
                    <span class="product-sku">ID ${s.productId} · ${p.sku || ''}</span>
                  </div>
                </td>
                <td>Cantidad: <strong>${s.qty}</strong></td>
                <td>Costo unit.: ${comprasFmt(comprasCost(p))}</td>
                <td style="text-align:right;">Subtotal: ${comprasFmt(s.qty * comprasCost(p))}</td>
              </tr>`;
        }).join('')}
            </tbody>
          </table>
        </div>`;
    }).join('')}
      ${provNames.length > 1 ? `
      <div class="compras-toolbar" style="justify-content:flex-end;">
        <button class="btn btn-primary" onclick="comprasGenerarTodas()">Generar Todas las OC (${provNames.length})</button>
      </div>` : ''}`;

    const ocsOrdenadas = [...comprasState.ocs].sort((a, b) => b.id.localeCompare(a.id));

    const ocRows = ocsOrdenadas.map(oc => {
        const abierta = _comprasOcOpen.has(oc.id);
        const detail = !abierta ? '' : `
        <tr class="compras-detail-row">
          <td colspan="7">
            <table class="compras-detail-table">
              <thead>
                <tr><th>Producto</th><th>SKU</th><th>Cantidad</th><th>Costo Unit.</th><th>Subtotal</th></tr>
              </thead>
              <tbody>
                ${oc.items.map(it => `
                <tr>
                  <td>${it.name}</td>
                  <td>${it.sku}</td>
                  <td>${it.qty}</td>
                  <td>${comprasFmt(it.unitCost)}</td>
                  <td>${comprasFmt(it.qty * it.unitCost)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
            ${oc.receivedDate ? `<p style="margin:0.6rem 0 0; font-size:0.8rem; color:var(--text-muted);">Recibida el ${oc.receivedDate}</p>` : ''}
          </td>
        </tr>`;
        return `
        <tr>
          <td style="font-weight:600; color:var(--text-primary);">${oc.id}</td>
          <td>${oc.date}</td>
          <td>${oc.supplier}</td>
          <td>${oc.items.length} ítem${oc.items.length !== 1 ? 's' : ''}</td>
          <td style="white-space:nowrap;">${comprasFmt(oc.total)}</td>
          <td><span class="badge ${oc.status === 'Recibida' ? 'badge-success' : 'badge-warning'}">${oc.status}</span></td>
          <td style="text-align:right; white-space:nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="comprasToggleOcDetail('${oc.id}')">${abierta ? 'Ocultar' : 'Ver'}</button>
            ${oc.status === 'Pendiente' ? `<button class="btn btn-success btn-sm" onclick="comprasRecibirOC('${oc.id}')">Marcar Recibida</button>` : ''}
          </td>
        </tr>${detail}`;
    }).join('');

    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Generación de Compras &nbsp;·&nbsp; ${aceptadas.length} pedido${aceptadas.length !== 1 ? 's' : ''} aceptado${aceptadas.length !== 1 ? 's' : ''}
          </span>
        </div>
        ${genHtml}
      </div>

      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Órdenes de Compra &nbsp;·&nbsp; ${comprasState.ocs.length} registradas
          </span>
        </div>
        ${comprasState.ocs.length === 0 ? `
        <div class="dataentry-placeholder" style="padding:2rem 1rem;">
          <h3>Sin órdenes de compra</h3>
          <p>Genera tu primera OC desde las solicitudes aceptadas.</p>
        </div>` : `
        <div class="table-responsive">
          <table class="custom-table" style="font-size:0.85rem;">
            <thead>
              <tr>
                <th>Nº OC</th><th>Fecha</th><th>Proveedor</th><th>Ítems</th><th>Total</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>${ocRows}</tbody>
          </table>
        </div>`}
      </div>
    </div>`;
}

function comprasGenerarOC(prov) {
    const solicitudes = comprasState.solicitudes.filter(s => s.status === 'aceptado' && (s.supplier || 'Sin proveedor') === prov);
    if (solicitudes.length === 0) return;

    // Combinar cantidades si el mismo producto aparece en varias solicitudes
    const itemsMap = {};
    solicitudes.forEach(s => {
        const p = comprasProduct(s.productId);
        if (!p) return;
        if (itemsMap[s.productId]) {
            itemsMap[s.productId].qty += s.qty;
        } else {
            itemsMap[s.productId] = { productId: s.productId, name: p.name, sku: p.sku, qty: s.qty, unitCost: comprasCost(p) };
        }
    });
    const items = Object.values(itemsMap);
    const total = Math.round(items.reduce((sum, it) => sum + it.qty * it.unitCost, 0) * 100) / 100;

    const ocId = 'OC-' + comprasState.ocSeq;
    comprasState.ocSeq++;
    comprasState.ocs.push({
        id: ocId,
        date: comprasToday(),
        supplier: prov,
        items: items,
        total: total,
        status: 'Pendiente',
        receivedDate: null
    });
    const ids = new Set(solicitudes.map(s => s.id));
    comprasState.solicitudes = comprasState.solicitudes.filter(s => !ids.has(s.id));
    saveComprasState();
    triggerToast('success', `Orden ${ocId} generada para ${prov}.`);
    renderCompras_Generacion();
}

function comprasGenerarTodas() {
    const provs = [...new Set(comprasState.solicitudes
        .filter(s => s.status === 'aceptado')
        .map(s => s.supplier || 'Sin proveedor'))];
    provs.forEach(prov => comprasGenerarOC(prov));
}

function comprasToggleOcDetail(ocId) {
    if (_comprasOcOpen.has(ocId)) _comprasOcOpen.delete(ocId); else _comprasOcOpen.add(ocId);
    renderCompras_Generacion();
}

function comprasRecibirOC(ocId) {
    const oc = comprasState.ocs.find(o => o.id === ocId);
    if (!oc || oc.status !== 'Pendiente') return;
    if (!confirm(`¿Marcar ${oc.id} como recibida? Se sumará el stock y se registrará la entrada en inventario.`)) return;

    oc.status = 'Recibida';
    oc.receivedDate = comprasToday();

    const now = new Date();
    const datetime = now.toISOString().slice(0, 10) + 'T' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    oc.items.forEach((it, i) => {
        const p = comprasProduct(it.productId);
        if (p) p.stock += it.qty;

        // Movimiento de Entrada en Ingreso de Datos (si el producto tiene material espejo)
        const code = p ? p.sku.replace(/^SKU-/, '') : '';
        const mat = (state.materials || []).find(m => m.code === code);
        if (mat) {
            const loc = (state.locations || []).find(l => p && l.warehouse === p.warehouse) || (state.locations || [])[0];
            state.movements.unshift({
                id: String(Date.now() + i),
                datetime: datetime,
                type: 'Entrada',
                status: 'Almacenado',
                user: 'Módulo Compras',
                doc: oc.id,
                materialId: mat.id, desc: mat.desc, um: mat.uom, category: mat.category,
                ubicBase: loc ? String(loc.base) : '', position: loc ? loc.position : '',
                ubicFinal: loc ? loc.final : '', bodega: loc ? loc.warehouse : '',
                lotAlm: 'LA-' + String(3000 + comprasState.ocSeq + i),
                lotProv: 'LP-' + String(9500 + comprasState.ocSeq + i),
                expiry: (p && p.expiry) || '',
                qty: it.qty
            });
        }
    });

    saveProductsToStorage();
    if (typeof saveDEKey === 'function') saveDEKey('movements');
    saveComprasState();
    triggerToast('success', `${oc.id} recibida: stock actualizado y entrada registrada en inventario.`);
    renderCompras_Generacion();
}

// ==========================================================================
//   APARTADO 3: CONSULTA POR PROVEEDOR
// ==========================================================================

function renderCompras_Consulta() {
    loadComprasState();
    const el = document.getElementById('compras-content');
    const provs = comprasAllSupplierNames();
    const prov = _comprasConsultaProv;

    let detalle = '';
    if (prov) {
        const asignados = (state.products || []).filter(p => comprasSuppliersFor(p.id).includes(prov));
        const noAsignados = (state.products || [])
            .filter(p => !comprasSuppliersFor(p.id).includes(prov))
            .sort((a, b) => a.name.localeCompare(b.name));
        const ocsProv = comprasState.ocs.filter(oc => oc.supplier === prov)
            .sort((a, b) => b.id.localeCompare(a.id));
        const totalComprado = ocsProv.reduce((sum, oc) => sum + oc.total, 0);

        detalle = `
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            Materiales que se le compran a ${prov} &nbsp;·&nbsp; ${asignados.length} producto${asignados.length !== 1 ? 's' : ''}
          </span>
        </div>

        <form onsubmit="comprasAsignarProducto(event)">
          <div class="form-row" style="grid-template-columns: 2fr auto; align-items:end;">
            <div class="form-group">
              <label class="form-label">Asignar producto a este proveedor (ID de producto)</label>
              <select class="form-select" id="compras-asignar-product">
                ${noAsignados.map(p => `<option value="${p.id}">ID ${p.id} — ${p.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <button type="submit" class="btn btn-primary" ${noAsignados.length === 0 ? 'disabled style="opacity:.45;"' : ''}>Asignar Producto</button>
            </div>
          </div>
        </form>

        ${asignados.length === 0 ? `<p style="color:var(--text-muted);">Este proveedor no tiene productos asignados.</p>` : `
        <div class="table-responsive">
          <table class="custom-table" style="font-size:0.85rem;">
            <thead>
              <tr><th>ID</th><th>Producto</th><th>Categoría</th><th>Stock / Reorden</th><th>Costo Estimado</th><th>Proveedores</th><th></th></tr>
            </thead>
            <tbody>
              ${asignados.map(p => {
            const provsDe = comprasSuppliersFor(p.id);
            return `
              <tr>
                <td style="font-weight:600; color:var(--text-primary);">${p.id}</td>
                <td>
                  <div class="product-meta-info">
                    <span class="product-name">${p.name}</span>
                    <span class="product-sku">${p.sku}</span>
                  </div>
                </td>
                <td>${p.category}</td>
                <td style="white-space:nowrap;">
                  <span style="${p.stock <= p.threshold ? 'color: var(--accent-rose, #e05260); font-weight:600;' : ''}">${p.stock}</span>
                  <span style="color:var(--text-muted);"> / ${p.threshold}</span>
                </td>
                <td style="white-space:nowrap;">${comprasFmt(comprasCost(p))}</td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${provsDe.join(', ')}</td>
                <td style="text-align:right;">
                  ${provsDe.length > 1 ? `<button class="btn btn-danger btn-sm" onclick="comprasQuitarAsignacion('${p.id}')">Quitar</button>` : ''}
                </td>
              </tr>`;
        }).join('')}
            </tbody>
          </table>
        </div>`}
      </div>

      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            Historial de Compras &nbsp;·&nbsp; ${ocsProv.length} OC &nbsp;·&nbsp; Total: ${comprasFmt(totalComprado)}
          </span>
        </div>
        ${ocsProv.length === 0 ? `<p style="color:var(--text-muted);">Aún no hay órdenes de compra para este proveedor.</p>` : `
        <div class="table-responsive">
          <table class="custom-table" style="font-size:0.85rem;">
            <thead>
              <tr><th>Nº OC</th><th>Fecha</th><th>Productos</th><th>Total</th><th>Estado</th></tr>
            </thead>
            <tbody>
              ${ocsProv.map(oc => `
              <tr>
                <td style="font-weight:600; color:var(--text-primary);">${oc.id}</td>
                <td>${oc.date}</td>
                <td style="font-size:0.82rem;">${oc.items.map(it => `${it.name} (x${it.qty})`).join('<br>')}</td>
                <td style="white-space:nowrap;">${comprasFmt(oc.total)}</td>
                <td><span class="badge ${oc.status === 'Recibida' ? 'badge-success' : 'badge-warning'}">${oc.status}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </div>`;
    }

    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Consulta por Proveedor
          </span>
        </div>
        <div class="form-row" style="grid-template-columns: 1fr; max-width:420px;">
          <div class="form-group">
            <label class="form-label">Proveedor</label>
            <select class="form-select" onchange="comprasSetConsultaProv(this.value)">
              <option value="">— Selecciona un proveedor —</option>
              ${provs.map(name => `<option value="${name}"${name === prov ? ' selected' : ''}>${name}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      ${detalle}
    </div>`;
}

function comprasSetConsultaProv(prov) {
    _comprasConsultaProv = prov;
    renderCompras_Consulta();
}

function comprasAsignarProducto(event) {
    event.preventDefault();
    const sel = document.getElementById('compras-asignar-product');
    const pid = sel ? sel.value : '';
    if (!pid || !_comprasConsultaProv) return;
    const actuales = comprasSuppliersFor(pid);
    if (!actuales.includes(_comprasConsultaProv)) {
        comprasState.productSuppliers[pid] = [...actuales, _comprasConsultaProv];
        saveComprasState();
        triggerToast('success', `Producto ID ${pid} asignado a ${_comprasConsultaProv}.`);
    }
    renderCompras_Consulta();
}

function comprasQuitarAsignacion(pid) {
    const actuales = comprasSuppliersFor(pid);
    if (actuales.length <= 1) return;
    comprasState.productSuppliers[pid] = actuales.filter(n => n !== _comprasConsultaProv);
    saveComprasState();
    renderCompras_Consulta();
}
