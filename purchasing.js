// AUREO — COMPRAS: Solicitud de Pedido (detección automática + manual, agrupada
// por proveedor, exportable a Excel) y Generación de Órdenes de Compra
// (consecutivo automático + consulta histórica por proveedor).
// Módulo 4 de 5 (CRM → Alertas → Reportes → Compras → Permisos).
//
// A propósito NO reimplementa cálculos que ya existen en otros módulos:
//   - El punto de reorden reutiliza getLowStockProducts() (alerts.js) — el
//     MISMO campo/lógica (`stock <= threshold`) que ya alimenta la alerta
//     "Producto bajo punto de reorden" del Dashboard. Una sola fuente de
//     verdad: si algún día se modela un reorderPoint real (lead time /
//     velocidad de venta), sólo hay que tocar ese archivo.
//   - Exportación a Excel reutiliza _exportReportXLSX() (reports.js), mismo
//     patrón SheetJS (_ensureXLSX guard → aoa_to_sheet → book_new → writeFile)
//     que ya usan Reportes y las plantillas de Materiales/Proveedores en
//     data-entry.js.
//
// MODELO PRODUCTO↔PROVEEDOR (muchos a muchos):
//   state.suppliers (data-entry.js) NO tenía ninguna asociación con productos
//   — sólo {id, name, acreedor}. En vez de mutar ese modelo (habría que migrar
//   registros existentes y el import/export de Excel de Proveedores), se
//   agrega una tabla de unión ligera: state.productSuppliers = [{productId,
//   supplierId}]. Es la forma con menos fricción de modelar "un producto
//   puede tener varios proveedores" (y viceversa) sin tocar data-entry.js.
//   Se auto-siembra UNA vez comparando el campo `product.supplier` (texto
//   libre ya existente en el catálogo, ej. "Ferrox Andina") contra
//   state.suppliers.name — así la demo arranca ya agrupada por proveedor.

// --------------------------------------------------------------------------
//   ESTADO DEL MÓDULO
// --------------------------------------------------------------------------
let activePurchasingSub = 'solicitud';
let _purchasingSupplierFilter = '';   // consulta por proveedor (sub Órdenes)
let _purchasingExpandedOrderId = null; // detalle expandido en la tabla de órdenes

// --------------------------------------------------------------------------
//   RUTEO DE SUB-PESTAÑAS (mismo patrón que switchReportSub / switchPickingSub)
// --------------------------------------------------------------------------
function switchPurchasingSub(sub) {
    activePurchasingSub = sub;
    renderPurchasing();
}

function renderPurchasing() {
    ensureProductSupplierSeed();
    ensurePurchaseRequestSeeded();

    document.querySelectorAll('.picking-subtab[id^="pursub-"]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`pursub-${activePurchasingSub}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('purchasing-content');
    if (!content) return;

    content.innerHTML = (activePurchasingSub === 'ordenes')
        ? _buildOrdenesView()
        : _buildSolicitudView();
}

// ==========================================================================
//   PERSISTENCIA
// ==========================================================================
function savePurchaseOrdersToStorage() {
    localStorage.setItem('aura_purchase_orders', JSON.stringify(state.purchaseOrders || []));
}

function saveProductSuppliersToStorage() {
    localStorage.setItem('aura_product_suppliers', JSON.stringify(state.productSuppliers || []));
}

// --------------------------------------------------------------------------
//   Semilla única de asociaciones producto↔proveedor a partir de
//   product.supplier (texto libre) ↔ supplier.name. Sólo corre si nunca se
//   ha guardado la tabla de unión (localStorage vacío), igual que
//   mergeSeedProducts()/SEED_VERSION en core.js pero sin versión: es un
//   join derivable en cualquier momento y el usuario puede seguir editándolo.
// --------------------------------------------------------------------------
function ensureProductSupplierSeed() {
    if (localStorage.getItem('aura_product_suppliers')) return;
    if (!Array.isArray(state.productSuppliers)) state.productSuppliers = [];
    if (state.productSuppliers.length > 0) { saveProductSuppliersToStorage(); return; }

    const byName = {};
    (state.suppliers || []).forEach(s => { byName[(s.name || '').trim().toLowerCase()] = s.id; });

    (state.products || []).forEach(p => {
        const key = (p.supplier || '').trim().toLowerCase();
        const supplierId = byName[key];
        if (!supplierId) return;
        state.productSuppliers.push({ productId: p.id, supplierId });
    });
    saveProductSuppliersToStorage();
}

function getProductSuppliers(productId) {
    const ids = (state.productSuppliers || []).filter(ps => ps.productId === productId).map(ps => ps.supplierId);
    return (state.suppliers || []).filter(s => ids.includes(s.id));
}

function getSupplierProducts(supplierId) {
    const ids = (state.productSuppliers || []).filter(ps => ps.supplierId === supplierId).map(ps => ps.productId);
    return (state.products || []).filter(p => ids.includes(p.id));
}

function addProductSupplierLink(productId, supplierId) {
    if (!productId || !supplierId) return;
    const exists = (state.productSuppliers || []).some(ps => ps.productId === productId && ps.supplierId === supplierId);
    if (exists) return;
    state.productSuppliers.push({ productId, supplierId });
    saveProductSuppliersToStorage();
}

function removeProductSupplierLink(productId, supplierId) {
    state.productSuppliers = (state.productSuppliers || []).filter(ps => !(ps.productId === productId && ps.supplierId === supplierId));
    saveProductSuppliersToStorage();
    renderPurchasing();
}

// ==========================================================================
//   ID INCREMENTAL DE ORDEN DE COMPRA — mismo patrón que nextPickingId()
//   (picking.js): máximo consecutivo existente + 1, prefijo-año fijo.
// ==========================================================================
function nextPurchaseOrderId() {
    let max = 0;
    (state.purchaseOrders || []).forEach(o => {
        const m = /OC-\d{4}-(\d+)/.exec(o.id);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `OC-2026-${String(max + 1).padStart(4, '0')}`;
}

// ==========================================================================
//   SOLICITUD DE PEDIDO — draft en memoria (mismo patrón que
//   state.invoiceItems en invoicing.js: no se persiste en localStorage,
//   vive sólo durante la sesión hasta que se acepta o se recarga la página).
// ==========================================================================
function ensurePurchaseRequestSeeded() {
    if (!Array.isArray(state.purchaseRequestItems)) state.purchaseRequestItems = [];
    if (state.purchaseRequestItems.length === 0) seedAutoLowStockItems();
}

// Heurística simple de cantidad sugerida: llevar el stock de vuelta al punto
// de reorden (déficit = threshold - stock). No modela lead time / velocidad
// de venta real — el analista puede editar la cantidad antes de aceptar.
function seedAutoLowStockItems() {
    const lowStock = (typeof getLowStockProducts === 'function') ? getLowStockProducts() : [];
    lowStock.forEach(p => {
        if (state.purchaseRequestItems.some(it => it.productId === p.id)) return;
        const stock = Number(p.stock);
        const threshold = Number(p.threshold);
        const qty = Math.max(1, threshold - stock);
        const suppliers = getProductSuppliers(p.id);
        state.purchaseRequestItems.push({
            productId: p.id,
            sku: p.sku || '',
            name: p.name,
            qty,
            supplierId: suppliers.length > 0 ? suppliers[0].id : null,
            auto: true
        });
    });
}

function refreshAutoLowStockItems() {
    const before = state.purchaseRequestItems.length;
    seedAutoLowStockItems();
    const added = state.purchaseRequestItems.length - before;
    triggerToast(added > 0 ? 'success' : 'info', added > 0
        ? `${added} producto(s) nuevo(s) bajo punto de reorden agregados a la solicitud.`
        : 'No hay productos nuevos bajo punto de reorden.');
    renderPurchasing();
}

function addManualPurchaseRequestItem() {
    const productSel = document.getElementById('pur-manual-product');
    const qtyInput = document.getElementById('pur-manual-qty');
    const supplierSel = document.getElementById('pur-manual-supplier');

    const productId = productSel.value;
    const qty = parseInt(qtyInput.value, 10);
    const supplierId = supplierSel.value || null;

    if (!productId || isNaN(qty) || qty <= 0) {
        triggerToast('error', 'Selecciona un producto y una cantidad válida.');
        return;
    }
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    if (supplierId) addProductSupplierLink(productId, supplierId);

    const existing = state.purchaseRequestItems.find(it => it.productId === productId);
    if (existing) {
        existing.qty += qty;
        if (supplierId && !existing.supplierId) existing.supplierId = supplierId;
    } else {
        state.purchaseRequestItems.push({
            productId: product.id,
            sku: product.sku || '',
            name: product.name,
            qty,
            supplierId,
            auto: false
        });
    }

    triggerToast('success', `${escapeHtml(product.name)} agregado a la solicitud.`);
    renderPurchasing();
}

function removePurchaseRequestItem(productId) {
    state.purchaseRequestItems = state.purchaseRequestItems.filter(it => it.productId !== productId);
    renderPurchasing();
}

function changePurchaseRequestQty(productId, newQty) {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty <= 0) return;
    const item = state.purchaseRequestItems.find(it => it.productId === productId);
    if (item) item.qty = qty;
    updatePurchaseRequestTotals();
}

function changePurchaseRequestSupplier(productId, supplierId) {
    const item = state.purchaseRequestItems.find(it => it.productId === productId);
    if (!item) return;
    item.supplierId = supplierId || null;
    if (supplierId) addProductSupplierLink(productId, supplierId);
    renderPurchasing();
}

// Recalcula sólo el contador visible sin re-renderizar todo el árbol (evita
// perder el foco del input mientras el analista escribe una cantidad).
function updatePurchaseRequestTotals() {
    const badge = document.getElementById('pur-req-count');
    if (badge) badge.innerText = `${state.purchaseRequestItems.length} línea(s)`;
}

// --------------------------------------------------------------------------
//   Aceptar solicitud → genera 1 Orden de Compra por proveedor con líneas
//   asignadas. Líneas sin proveedor NO generan orden (no tiene sentido una
//   OC sin destinatario) — se avisa cuántas quedaron fuera para que el
//   analista las asigne y reintente.
// --------------------------------------------------------------------------
function acceptPurchaseRequest() {
    if (!state.purchaseRequestItems || state.purchaseRequestItems.length === 0) {
        triggerToast('error', 'La solicitud no tiene productos.');
        return;
    }

    const groups = {};
    let skipped = 0;
    state.purchaseRequestItems.forEach(it => {
        if (!it.supplierId) { skipped++; return; }
        if (!groups[it.supplierId]) groups[it.supplierId] = [];
        groups[it.supplierId].push(it);
    });

    const supplierIds = Object.keys(groups);
    if (supplierIds.length === 0) {
        triggerToast('error', 'Ningún producto tiene proveedor asignado. Asigna al menos uno antes de generar órdenes.');
        return;
    }

    if (!Array.isArray(state.purchaseOrders)) state.purchaseOrders = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const created = [];

    supplierIds.forEach(sid => {
        const supplier = state.suppliers.find(s => s.id === sid);
        const order = {
            id: nextPurchaseOrderId(),
            supplierId: sid,
            supplierName: supplier ? supplier.name : 'Proveedor desconocido',
            date: todayStr,
            items: groups[sid].map(it => ({ productId: it.productId, sku: it.sku, name: it.name, qty: it.qty })),
            status: 'generada',
            createdAt: Date.now()
        };
        state.purchaseOrders.push(order);
        created.push(order);
    });

    savePurchaseOrdersToStorage();
    state.purchaseRequestItems = [];

    const msg = `${created.length} orden(es) de compra generada(s): ${created.map(o => o.id).join(', ')}.` +
        (skipped > 0 ? ` ${skipped} línea(s) sin proveedor no se incluyeron.` : '');
    triggerToast('success', msg);

    activePurchasingSub = 'ordenes';
    renderPurchasing();
}

// --------------------------------------------------------------------------
//   Exportar solicitud actual a Excel (SheetJS) — reutiliza
//   _exportReportXLSX() de reports.js.
// --------------------------------------------------------------------------
function exportPurchaseRequestXLSX() {
    if (!state.purchaseRequestItems || state.purchaseRequestItems.length === 0) {
        triggerToast('error', 'No hay productos en la solicitud para exportar.');
        return;
    }
    const sorted = [...state.purchaseRequestItems].sort((a, b) => {
        const an = _supplierNameFor(a.supplierId), bn = _supplierNameFor(b.supplierId);
        return an.localeCompare(bn) || a.name.localeCompare(b.name);
    });
    const rows = sorted.map(it => [
        _supplierNameFor(it.supplierId),
        it.productId,
        it.sku || '',
        it.name,
        it.qty,
        it.auto ? 'Automático (bajo punto de reorden)' : 'Manual'
    ]);
    const headers = ['Proveedor', 'ID Producto', 'SKU', 'Producto', 'Cantidad', 'Origen'];
    const ok = typeof _exportReportXLSX === 'function'
        ? _exportReportXLSX(`Solicitud_Pedido_${_reportDateStr ? _reportDateStr() : new Date().toISOString().split('T')[0]}.xlsx`, 'Solicitud', headers, rows)
        : false;
    if (ok) triggerToast('success', 'Solicitud exportada a Excel.');
}

function _supplierNameFor(supplierId) {
    if (!supplierId) return 'Sin proveedor asignado';
    const s = state.suppliers.find(s => s.id === supplierId);
    return s ? s.name : 'Proveedor desconocido';
}

// ==========================================================================
//   RENDER — SOLICITUD DE PEDIDO
// ==========================================================================
function _buildSolicitudView() {
    const items = state.purchaseRequestItems || [];
    const autoCount = items.filter(i => i.auto).length;

    // Agrupar por proveedor preservando un orden estable (proveedor primero,
    // "Sin proveedor asignado" al final).
    const groups = {};
    items.forEach(it => {
        const key = it.supplierId || '__unassigned';
        if (!groups[key]) groups[key] = [];
        groups[key].push(it);
    });
    const supplierKeys = Object.keys(groups).filter(k => k !== '__unassigned')
        .sort((a, b) => _supplierNameFor(a).localeCompare(_supplierNameFor(b)));
    if (groups.__unassigned) supplierKeys.push('__unassigned');

    const groupsHtml = supplierKeys.length === 0 ? `
        <div style="text-align:center; color: var(--text-muted); padding: 2.5rem 0;">
            No hay productos en la solicitud. Se detectarán automáticamente los que estén bajo el punto de reorden,
            o agrega uno manualmente arriba.
        </div>` : supplierKeys.map(key => {
        const isUnassigned = key === '__unassigned';
        const rows = groups[key].map(it => `
            <tr>
                <td>
                    <span class="product-name">${escapeHtml(it.name)}</span>
                    ${it.auto ? '<span class="badge badge-warning" style="margin-left:.4rem;">Auto</span>' : ''}
                </td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;">${escapeHtml(it.sku || '—')}</td>
                <td style="text-align:center;">
                    <input type="number" class="qty-input" value="${it.qty}" min="1" style="width:80px;"
                        onchange="changePurchaseRequestQty('${it.productId}', this.value)">
                </td>
                <td>
                    <select class="form-select" style="min-width:180px;" onchange="changePurchaseRequestSupplier('${it.productId}', this.value)">
                        <option value="">Sin asignar</option>
                        ${(state.suppliers || []).map(s => `<option value="${s.id}" ${it.supplierId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                    </select>
                </td>
                <td style="text-align:right;">
                    <button class="btn btn-secondary btn-icon-only" onclick="removePurchaseRequestItem('${it.productId}')" title="Quitar" style="border-color: rgba(255,42,95,0.15); color: var(--accent-rose);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </td>
            </tr>`).join('');

        return `
            <div style="margin-bottom:1.5rem;">
                <div style="font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${isUnassigned ? 'var(--accent-rose)' : 'var(--text-muted)'};margin-bottom:.6rem;">
                    ${isUnassigned ? 'Sin proveedor asignado' : escapeHtml(_supplierNameFor(key))}
                    <span class="badge ${isUnassigned ? 'badge-danger' : 'badge-info'}" style="margin-left:.4rem;">${groups[key].length}</span>
                </div>
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead><tr><th>Producto</th><th>SKU</th><th style="text-align:center;">Cantidad</th><th>Proveedor</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }).join('');

    return `
    <div class="dataentry-panel">

      <!-- DETECCIÓN AUTOMÁTICA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Detección Automática — Bajo Punto de Reorden
          </span>
          <button class="btn btn-secondary btn-sm" onclick="refreshAutoLowStockItems()">Actualizar detección</button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:0;">
          ${autoCount} de ${items.length} línea(s) fueron agregadas automáticamente por estar en o bajo su punto de reorden
          (mismo criterio que la alerta "Producto bajo punto de reorden" del Dashboard). Puedes editar cantidad, cambiar
          el proveedor o quitarlas.
        </p>
      </div>

      <!-- AGREGAR MANUALMENTE -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Agregar Producto Manualmente
          </span>
        </div>
        <div class="form-row" style="grid-template-columns: 2fr 1fr 2fr auto;">
          <div class="form-group">
            <label class="form-label">Producto</label>
            <select class="form-select" id="pur-manual-product">
              ${(state.products || []).map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku || p.id)})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Cantidad</label>
            <input type="number" class="form-input" id="pur-manual-qty" value="1" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Proveedor</label>
            <select class="form-select" id="pur-manual-supplier">
              <option value="">Sin asignar</option>
              ${(state.suppliers || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="justify-content:flex-end;display:flex;">
            <button class="btn btn-primary" onclick="addManualPurchaseRequestItem()">Agregar</button>
          </div>
        </div>
      </div>

      <!-- SOLICITUD ACTUAL AGRUPADA POR PROVEEDOR -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Solicitud Actual — Agrupada por Proveedor</span>
          <span class="badge badge-info" id="pur-req-count">${items.length} línea(s)</span>
        </div>
        ${groupsHtml}
        <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="exportPurchaseRequestXLSX()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar a Excel
          </button>
          <button class="btn btn-primary" onclick="acceptPurchaseRequest()">Aceptar solicitud → Generar Órdenes de Compra</button>
        </div>
      </div>

      <!-- ASOCIAR PRODUCTOS A PROVEEDORES (muchos a muchos) -->
      ${_buildProductSupplierManager()}

    </div>`;
}

// --------------------------------------------------------------------------
//   Panel de gestión producto↔proveedor: permite asociar un mismo producto
//   a varios proveedores (y viceversa), leyendo/escribiendo state.productSuppliers.
// --------------------------------------------------------------------------
function _buildProductSupplierManager() {
    const links = state.productSuppliers || [];
    const rows = links.map(ps => {
        const p = (state.products || []).find(x => x.id === ps.productId);
        const s = (state.suppliers || []).find(x => x.id === ps.supplierId);
        if (!p || !s) return '';
        return `
            <tr>
                <td>${escapeHtml(p.name)}</td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;">${escapeHtml(p.sku || p.id)}</td>
                <td>${escapeHtml(s.name)}</td>
                <td style="text-align:right;">
                    <button class="btn btn-danger btn-icon-only" onclick="removeProductSupplierLink('${p.id}','${s.id}')" title="Quitar asociación">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </td>
            </tr>`;
    }).join('');

    return `
    <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Asociar Productos a Proveedores</span>
          <span class="badge badge-info">${links.length} asociación(es)</span>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1rem;">
          Un mismo producto puede tener varios proveedores (y un proveedor, varios productos). Estas asociaciones
          determinan cómo se agrupa la Solicitud de Pedido y alimentan la consulta "por proveedor" de Órdenes de Compra.
        </p>
        <div class="form-row" style="grid-template-columns: 2fr 2fr auto;">
          <div class="form-group">
            <label class="form-label">Producto</label>
            <select class="form-select" id="pur-assoc-product">
              ${(state.products || []).map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sku || p.id)})</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Proveedor</label>
            <select class="form-select" id="pur-assoc-supplier">
              ${(state.suppliers || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="justify-content:flex-end;display:flex;">
            <button class="btn btn-secondary" onclick="_addAssociationFromManager()">Asociar</button>
          </div>
        </div>
        <div class="table-responsive" style="margin-top:1rem; max-height:260px; overflow-y:auto;">
          <table class="custom-table">
            <thead><tr><th>Producto</th><th>SKU</th><th>Proveedor</th><th></th></tr></thead>
            <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem 0;">Sin asociaciones registradas.</td></tr>`}</tbody>
          </table>
        </div>
    </div>`;
}

function _addAssociationFromManager() {
    const productId = document.getElementById('pur-assoc-product').value;
    const supplierId = document.getElementById('pur-assoc-supplier').value;
    if (!productId || !supplierId) return;
    const already = (state.productSuppliers || []).some(ps => ps.productId === productId && ps.supplierId === supplierId);
    addProductSupplierLink(productId, supplierId);
    triggerToast(already ? 'info' : 'success', already ? 'Esa asociación ya existía.' : 'Asociación creada.');
    renderPurchasing();
}

// ==========================================================================
//   RENDER — ÓRDENES DE COMPRA + CONSULTA POR PROVEEDOR
// ==========================================================================
function _buildOrdenesView() {
    const orders = [...(state.purchaseOrders || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const filtered = _purchasingSupplierFilter
        ? orders.filter(o => o.supplierId === _purchasingSupplierFilter)
        : orders;

    const supplierOptions = [...(state.suppliers || [])].sort((a, b) => a.name.localeCompare(b.name))
        .map(s => `<option value="${s.id}" ${_purchasingSupplierFilter === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

    // --- Resumen "consulta por proveedor": todos los materiales comprados históricamente ---
    let summaryHtml = '';
    if (_purchasingSupplierFilter) {
        const supplier = (state.suppliers || []).find(s => s.id === _purchasingSupplierFilter);
        const materialsMap = {};
        orders.filter(o => o.supplierId === _purchasingSupplierFilter).forEach(o => {
            (o.items || []).forEach(it => {
                if (!materialsMap[it.productId]) materialsMap[it.productId] = { name: it.name, sku: it.sku, qty: 0, orders: 0 };
                materialsMap[it.productId].qty += it.qty;
                materialsMap[it.productId].orders += 1;
            });
        });
        const materialRows = Object.values(materialsMap).sort((a, b) => b.qty - a.qty).map(m => `
            <tr>
                <td>${escapeHtml(m.name)}</td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;">${escapeHtml(m.sku || '—')}</td>
                <td style="text-align:center;">${m.orders}</td>
                <td style="text-align:right;font-weight:600;">${m.qty}</td>
            </tr>`).join('');

        summaryHtml = `
        <div class="dataentry-section-card">
            <div class="dataentry-section-header">
                <span class="dataentry-section-title">Materiales comprados a ${escapeHtml(supplier ? supplier.name : 'proveedor')}</span>
                <span class="badge badge-info">${Object.keys(materialsMap).length} material(es)</span>
            </div>
            <div class="table-responsive">
                <table class="custom-table">
                    <thead><tr><th>Producto</th><th>SKU</th><th style="text-align:center;"># Órdenes</th><th style="text-align:right;">Cantidad total</th></tr></thead>
                    <tbody>${materialRows || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1.5rem 0;">Este proveedor no tiene órdenes de compra registradas todavía.</td></tr>`}</tbody>
                </table>
            </div>
        </div>`;
    }

    const orderRows = filtered.map(o => {
        const totalQty = (o.items || []).reduce((s, it) => s + it.qty, 0);
        const isExpanded = _purchasingExpandedOrderId === o.id;
        const detailRows = (o.items || []).map(it => `
            <tr>
                <td style="padding-left:2rem;">${escapeHtml(it.name)}</td>
                <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;">${escapeHtml(it.sku || '—')}</td>
                <td style="text-align:right;">${it.qty}</td>
            </tr>`).join('');

        return `
            <tr>
                <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--accent-gold);font-weight:700;">${escapeHtml(o.id)}</td>
                <td>${escapeHtml(o.supplierName)}</td>
                <td>${o.date}</td>
                <td style="text-align:center;">${(o.items || []).length}</td>
                <td style="text-align:right;">${totalQty}</td>
                <td style="text-align:center;"><span class="badge badge-success">${escapeHtml(o.status || 'generada')}</span></td>
                <td style="text-align:center;">
                    <button class="btn btn-secondary btn-sm" onclick="togglePurchaseOrderDetail('${o.id}')">${isExpanded ? 'Ocultar' : 'Ver detalle'}</button>
                </td>
            </tr>
            ${isExpanded ? `
            <tr>
                <td colspan="7" style="background: var(--bg-subtle, rgba(0,0,0,0.02)); padding: 0.75rem 1rem;">
                    <table class="custom-table" style="font-size:.85rem;">
                        <thead><tr><th style="padding-left:2rem;">Producto</th><th>SKU</th><th style="text-align:right;">Cantidad</th></tr></thead>
                        <tbody>${detailRows}</tbody>
                    </table>
                </td>
            </tr>` : ''}`;
    }).join('');

    return `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Consulta por Proveedor</span>
        </div>
        <div class="form-row" style="grid-template-columns: 2fr auto;">
          <div class="form-group">
            <label class="form-label">Proveedor</label>
            <select class="form-select" onchange="filterPurchaseOrdersBySupplier(this.value)">
              <option value="">Todos los proveedores</option>
              ${supplierOptions}
            </select>
          </div>
          <div class="form-group" style="justify-content:flex-end;display:flex;">
            ${_purchasingSupplierFilter ? `<button class="btn btn-secondary" onclick="filterPurchaseOrdersBySupplier('')">Quitar filtro</button>` : ''}
          </div>
        </div>
      </div>

      ${summaryHtml}

      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Órdenes de Compra</span>
          <span class="badge badge-info">${filtered.length} orden(es)</span>
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Consecutivo</th><th>Proveedor</th><th>Fecha</th>
              <th style="text-align:center;">Ítems</th><th style="text-align:right;">Cantidad</th>
              <th style="text-align:center;">Estado</th><th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody>${orderRows || `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin órdenes de compra registradas.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function filterPurchaseOrdersBySupplier(supplierId) {
    _purchasingSupplierFilter = supplierId;
    renderPurchasing();
}

function togglePurchaseOrderDetail(orderId) {
    _purchasingExpandedOrderId = (_purchasingExpandedOrderId === orderId) ? null : orderId;
    renderPurchasing();
}
