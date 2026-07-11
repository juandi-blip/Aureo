// AUREO — REPORTES: vista unificada y exportable de Ventas, Rotación, Rentabilidad y Por Cliente.
// Módulo 3 de 5 (CRM → Alertas → Reportes → Compras → Permisos).
//
// A propósito NO reimplementa cálculos que ya existen en otros módulos:
//   - Rotación reutiliza calculateABCClassification() (wms.js) — sólo la expone
//     como tabla exportable, no reimplementa el Pareto/ABC.
//   - Por Cliente reutiliza computeClientStats()/getClientInvoices() (clients.js).
//   - Ventas y Rentabilidad leen state.invoices directamente (mismo patrón que
//     el resto del sistema: todo se recalcula al vuelo, sin caché).
//
// Exportación: SheetJS (XLSX ya cargado por index.html), mismo patrón que las
// plantillas de Materiales/Proveedores/Ubicaciones en data-entry.js
// (_ensureXLSX guard → aoa_to_sheet → book_new → writeFile).

// --------------------------------------------------------------------------
//   ESTADO DEL MÓDULO
// --------------------------------------------------------------------------
let activeReportSub = 'ventas';

let _repVentasFrom = '';
let _repVentasTo = '';

let _repRentFrom = '';
let _repRentTo = '';

let _repClientesSearch = '';

// Margen asumido para el reporte de Rentabilidad. No existe un campo de costo
// real por producto en el catálogo (sólo `price`), así que esta cifra es una
// ESTIMACIÓN uniforme para dar una idea de utilidad — no un cálculo contable
// real. Se muestra un aviso explícito en la UI y en el archivo exportado.
const REPORT_ASSUMED_MARGIN_PCT = 35;

// --------------------------------------------------------------------------
//   RUTEO DE SUB-PESTAÑAS (mismo patrón que switchPickingSub en picking.js)
// --------------------------------------------------------------------------
function switchReportSub(sub) {
    activeReportSub = sub;
    renderReportes();
}

function renderReportes() {
    document.querySelectorAll('.picking-subtab[id^="repsub-"]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`repsub-${activeReportSub}`);
    if (activeBtn) activeBtn.classList.add('active');

    const content = document.getElementById('reports-content');
    if (!content) return;

    switch (activeReportSub) {
        case 'ventas': content.innerHTML = _buildReportVentas(); break;
        case 'rotacion': content.innerHTML = _buildReportRotacion(); break;
        case 'rentabilidad': content.innerHTML = _buildReportRentabilidad(); break;
        case 'clientes': content.innerHTML = _buildReportPorCliente(); break;
        default: content.innerHTML = _buildReportVentas();
    }
}

// --------------------------------------------------------------------------
//   HELPER COMPARTIDO — export a Excel real vía SheetJS
// --------------------------------------------------------------------------
function _exportReportXLSX(filename, sheetName, headers, rows) {
    if (!_ensureXLSX()) return false;
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    return true;
}

function _reportDateStr() {
    return new Date().toISOString().split('T')[0];
}

// ==========================================================================
//   REPORTE 1 — VENTAS (facturas por rango de fechas, totales por día)
// ==========================================================================
function _getInvoicesInRange(from, to) {
    return (state.invoices || []).filter(inv => {
        if (from && inv.date && inv.date < from) return false;
        if (to && inv.date && inv.date > to) return false;
        return true;
    });
}

function applyReportVentasFilter() {
    _repVentasFrom = document.getElementById('rep-ventas-from')?.value || '';
    _repVentasTo = document.getElementById('rep-ventas-to')?.value || '';
    renderReportes();
}

function clearReportVentasFilter() {
    _repVentasFrom = '';
    _repVentasTo = '';
    renderReportes();
}

function _buildReportVentas() {
    const invoices = _getInvoicesInRange(_repVentasFrom, _repVentasTo);
    const totalCount = invoices.length;
    const totalRevenue = invoices.reduce((s, i) => s + (i.total || 0), 0);
    const avgTicket = totalCount ? totalRevenue / totalCount : 0;

    const byDay = {};
    invoices.forEach(inv => {
        const d = inv.date || 'Sin fecha';
        if (!byDay[d]) byDay[d] = { count: 0, total: 0 };
        byDay[d].count++;
        byDay[d].total += (inv.total || 0);
    });
    const dayRows = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));

    return `
    <div class="card" style="margin-bottom:1.5rem;">
        <div class="table-controls" style="flex-wrap:wrap; gap:1rem; margin-bottom:0;">
            <div class="search-filter-group" style="flex-wrap:wrap; align-items:flex-end; gap:1rem; max-width:100%;">
                <div style="min-width:160px;">
                    <label class="form-label" style="margin-bottom:.4rem; font-size:.8rem;">Desde</label>
                    <input type="date" class="form-input" id="rep-ventas-from" value="${_repVentasFrom}">
                </div>
                <div style="min-width:160px;">
                    <label class="form-label" style="margin-bottom:.4rem; font-size:.8rem;">Hasta</label>
                    <input type="date" class="form-input" id="rep-ventas-to" value="${_repVentasTo}">
                </div>
                <button class="btn btn-primary btn-sm" onclick="applyReportVentasFilter()" style="height:42px;">Aplicar</button>
                <button class="btn btn-secondary btn-sm" onclick="clearReportVentasFilter()" style="height:42px;">Limpiar</button>
            </div>
            <div style="display:flex; gap:.75rem; flex-shrink:0;">
                <button class="btn btn-secondary btn-sm" onclick="exportReportVentas()" style="height:42px;">
                    ${_reportExportIcon()} Exportar Excel
                </button>
            </div>
        </div>
    </div>

    <div class="stats-grid" style="margin-bottom:1.5rem;">
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Facturas en el rango</span></div>
            <div class="stat-value">${totalCount}</div>
        </div>
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Ingresos Totales</span></div>
            <div class="stat-value">${formatCurrency(totalRevenue)}</div>
        </div>
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Ticket Promedio</span></div>
            <div class="stat-value">${formatCurrency(avgTicket)}</div>
        </div>
    </div>

    <div class="card">
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th style="text-align:center;">Facturas</th>
                        <th style="text-align:right;">Ingresos</th>
                    </tr>
                </thead>
                <tbody>
                    ${dayRows.length ? dayRows.map(([d, v]) => `
                        <tr>
                            <td>${d}</td>
                            <td style="text-align:center;">${v.count}</td>
                            <td style="text-align:right; font-weight:600; color:var(--text-primary);">${formatCurrency(v.total)}</td>
                        </tr>`).join('') : `
                        <tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:3rem 0;">Sin facturas en el rango seleccionado.</td></tr>`}
                </tbody>
            </table>
        </div>
    </div>`;
}

function exportReportVentas() {
    const invoices = _getInvoicesInRange(_repVentasFrom, _repVentasTo);
    if (invoices.length === 0) {
        triggerToast('error', 'No hay facturas para exportar con el rango seleccionado.');
        return;
    }
    const headers = ['Factura', 'Fecha', 'Cliente', 'NIT/ID', 'Items', 'Subtotal', 'Descuento', 'Impuesto', 'Total', 'Estado'];
    const sorted = [...invoices].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rows = sorted.map(inv => [
        inv.id || '', inv.date || '', inv.clientName || 'Consumidor Final', inv.clientId || '',
        (inv.items || []).reduce((s, it) => s + (it.qty || 0), 0),
        (inv.subtotal || 0).toFixed(2), (inv.discountVal || 0).toFixed(2), (inv.taxVal || 0).toFixed(2),
        (inv.total || 0).toFixed(2), inv.status || ''
    ]);
    const ok = _exportReportXLSX(`AUREO_Reporte_Ventas_${_reportDateStr()}.xlsx`, 'Ventas', headers, rows);
    if (ok) triggerToast('success', `Reporte de ventas exportado correctamente (${invoices.length} facturas).`);
}

// ==========================================================================
//   REPORTE 2 — ROTACIÓN (expone calculateABCClassification() de wms.js)
// ==========================================================================
function _getRotationClassification() {
    let classification = [];
    try { classification = calculateABCClassification(); } catch (e) { /* filtros ABC aún no montados */ }
    return classification || [];
}

function _buildReportRotacion() {
    const classification = _getRotationClassification();
    const sorted = [...classification].sort((a, b) => b.abcScore - a.abcScore);

    return `
    <div class="card" style="margin-bottom:1.5rem;">
        <div class="table-controls" style="margin-bottom:0;">
            <div class="search-filter-group">
                <p style="color:var(--text-muted); font-size:.85rem; margin:0;">
                    Se muestra la clasificación ABC/Pareto vigente (misma configurada en Optimización WMS → filtros de depósito, categoría y período).
                </p>
            </div>
            <div style="display:flex; gap:.75rem; flex-shrink:0;">
                <button class="btn btn-secondary btn-sm" onclick="exportReportRotacion()" style="height:42px;">
                    ${_reportExportIcon()} Exportar Excel
                </button>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>SKU</th>
                        <th>Categoría</th>
                        <th style="text-align:center;">Clase</th>
                        <th style="text-align:right;">Ventas (uds)</th>
                        <th style="text-align:right;">Ingresos</th>
                        <th style="text-align:center;">Mal Ubicado</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.length ? sorted.map(p => `
                        <tr>
                            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(p.name)}</td>
                            <td style="font-family:'JetBrains Mono',monospace; font-size:.82rem;">${escapeHtml(p.sku)}</td>
                            <td>${escapeHtml(p.category)}</td>
                            <td style="text-align:center; font-weight:700;">${p.abcClass}</td>
                            <td style="text-align:right;">${p.salesQuantity}</td>
                            <td style="text-align:right; font-weight:600;">${formatCurrency(p.salesRevenue)}</td>
                            <td style="text-align:center;">${p.isMisplaced ? 'Sí' : 'No'}</td>
                        </tr>`).join('') : `
                        <tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:3rem 0;">Sin datos de rotación para los filtros actuales de Optimización WMS.</td></tr>`}
                </tbody>
            </table>
        </div>
    </div>`;
}

function exportReportRotacion() {
    const classification = _getRotationClassification();
    if (classification.length === 0) {
        triggerToast('error', 'No hay datos de rotación para exportar.');
        return;
    }
    const sorted = [...classification].sort((a, b) => b.abcScore - a.abcScore);
    const headers = ['Producto', 'SKU', 'Categoría', 'Clase ABC', 'Score ABC', 'Ventas (uds)', 'Ingresos', 'Bodega', 'Pasillo', 'Distancia Picking (m)', 'Mal Ubicado', 'Acción Recomendada'];
    const rows = sorted.map(p => [
        p.name, p.sku, p.category, p.abcClass, p.abcScore.toFixed(2), p.salesQuantity, p.salesRevenue.toFixed(2),
        p.warehouse, p.aisle, p.pickingDistance, p.isMisplaced ? 'Sí' : 'No',
        p.isMisplaced ? `Trasladar a Pasillo ${p.suggestedAisle}` : 'Sin cambios'
    ]);
    const ok = _exportReportXLSX(`AUREO_Reporte_Rotacion_${_reportDateStr()}.xlsx`, 'Rotacion', headers, rows);
    if (ok) triggerToast('success', `Reporte de rotación exportado correctamente (${classification.length} productos).`);
}

// ==========================================================================
//   REPORTE 3 — RENTABILIDAD (APROXIMADO — no existe campo de costo real)
// ==========================================================================
function applyReportRentFilter() {
    _repRentFrom = document.getElementById('rep-rent-from')?.value || '';
    _repRentTo = document.getElementById('rep-rent-to')?.value || '';
    renderReportes();
}

function clearReportRentFilter() {
    _repRentFrom = '';
    _repRentTo = '';
    renderReportes();
}

function _computeRentabilidad() {
    const invoices = _getInvoicesInRange(_repRentFrom, _repRentTo);
    const marginFrac = REPORT_ASSUMED_MARGIN_PCT / 100;
    const byProduct = {};

    invoices.forEach(inv => {
        (inv.items || []).forEach(item => {
            const key = item.productId || item.name;
            if (!byProduct[key]) {
                const prod = state.products.find(p => p.id === item.productId);
                byProduct[key] = {
                    name: item.name || (prod && prod.name) || 'Producto',
                    sku: (prod && prod.sku) || '—',
                    qty: 0, revenue: 0
                };
            }
            byProduct[key].qty += (item.qty || 0);
            byProduct[key].revenue += (item.price || 0) * (item.qty || 0);
        });
    });

    return Object.values(byProduct).map(p => ({
        ...p,
        estUtilidad: p.revenue * marginFrac
    })).sort((a, b) => b.revenue - a.revenue);
}

function _buildReportRentabilidad() {
    const rows = _computeRentabilidad();
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalUtilidad = rows.reduce((s, r) => s + r.estUtilidad, 0);

    return `
    <div class="card" style="margin-bottom:1.5rem; border-left:3px solid var(--accent-gold, #d4a94a);">
        <p style="margin:0; font-size:.85rem; color:var(--text-secondary); line-height:1.5;">
            <strong>Aviso:</strong> el catálogo de productos no tiene un campo de <em>costo</em> real, sólo precio de venta.
            La "Utilidad Estimada" de este reporte es una <strong>aproximación</strong> calculada con un margen asumido
            uniforme de <strong>${REPORT_ASSUMED_MARGIN_PCT}%</strong> sobre los ingresos — no refleja el costo real por
            producto. Para cifras de rentabilidad exactas, se debe incorporar un campo de costo por producto
            (posible mejora en el módulo de Compras).
        </p>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
        <div class="table-controls" style="flex-wrap:wrap; gap:1rem; margin-bottom:0;">
            <div class="search-filter-group" style="flex-wrap:wrap; align-items:flex-end; gap:1rem; max-width:100%;">
                <div style="min-width:160px;">
                    <label class="form-label" style="margin-bottom:.4rem; font-size:.8rem;">Desde</label>
                    <input type="date" class="form-input" id="rep-rent-from" value="${_repRentFrom}">
                </div>
                <div style="min-width:160px;">
                    <label class="form-label" style="margin-bottom:.4rem; font-size:.8rem;">Hasta</label>
                    <input type="date" class="form-input" id="rep-rent-to" value="${_repRentTo}">
                </div>
                <button class="btn btn-primary btn-sm" onclick="applyReportRentFilter()" style="height:42px;">Aplicar</button>
                <button class="btn btn-secondary btn-sm" onclick="clearReportRentFilter()" style="height:42px;">Limpiar</button>
            </div>
            <div style="display:flex; gap:.75rem; flex-shrink:0;">
                <button class="btn btn-secondary btn-sm" onclick="exportReportRentabilidad()" style="height:42px;">
                    ${_reportExportIcon()} Exportar Excel
                </button>
            </div>
        </div>
    </div>

    <div class="stats-grid" style="margin-bottom:1.5rem;">
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Ingresos Totales</span></div>
            <div class="stat-value">${formatCurrency(totalRevenue)}</div>
        </div>
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Utilidad Estimada (~${REPORT_ASSUMED_MARGIN_PCT}%)</span></div>
            <div class="stat-value">${formatCurrency(totalUtilidad)}</div>
        </div>
    </div>

    <div class="card">
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>SKU</th>
                        <th style="text-align:right;">Unidades Vendidas</th>
                        <th style="text-align:right;">Ingresos</th>
                        <th style="text-align:right;">Utilidad Estimada*</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.length ? rows.map(r => `
                        <tr>
                            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(r.name)}</td>
                            <td style="font-family:'JetBrains Mono',monospace; font-size:.82rem;">${escapeHtml(r.sku)}</td>
                            <td style="text-align:right;">${r.qty}</td>
                            <td style="text-align:right; font-weight:600;">${formatCurrency(r.revenue)}</td>
                            <td style="text-align:right; color:var(--text-secondary);">${formatCurrency(r.estUtilidad)}</td>
                        </tr>`).join('') : `
                        <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:3rem 0;">Sin ventas en el rango seleccionado.</td></tr>`}
                </tbody>
            </table>
        </div>
        <p style="font-size:.78rem; color:var(--text-muted); margin:.75rem 0 0;">* Estimado, no un costo real — ver aviso arriba.</p>
    </div>`;
}

function exportReportRentabilidad() {
    const rows = _computeRentabilidad();
    if (rows.length === 0) {
        triggerToast('error', 'No hay ventas para exportar con el rango seleccionado.');
        return;
    }
    const headers = ['Producto', 'SKU', 'Unidades Vendidas', 'Ingresos', `Utilidad Estimada (~${REPORT_ASSUMED_MARGIN_PCT}% asumido, no es costo real)`];
    const dataRows = rows.map(r => [r.name, r.sku, r.qty, r.revenue.toFixed(2), r.estUtilidad.toFixed(2)]);
    const ok = _exportReportXLSX(`AUREO_Reporte_Rentabilidad_${_reportDateStr()}.xlsx`, 'Rentabilidad', headers, dataRows);
    if (ok) triggerToast('success', `Reporte de rentabilidad exportado correctamente (${rows.length} productos).`);
}

// ==========================================================================
//   REPORTE 4 — POR CLIENTE (reutiliza computeClientStats/getClientInvoices)
// ==========================================================================
function filterReportClientes() {
    _repClientesSearch = document.getElementById('rep-clientes-search')?.value || '';
    renderReportes();
}

function _computeClientesReportRows() {
    const q = _repClientesSearch.toLowerCase();
    const filtered = (state.clients || []).filter(c =>
        c.nombre.toLowerCase().includes(q) || (c.nit || '').toLowerCase().includes(q)
    );
    return filtered.map(c => ({ cliente: c, stats: computeClientStats(c) }))
        .sort((a, b) => b.stats.totalValue - a.stats.totalValue);
}

function _buildReportPorCliente() {
    const withStats = _computeClientesReportRows();
    const totalRevenue = withStats.reduce((s, r) => s + r.stats.totalValue, 0);

    return `
    <div class="card" style="margin-bottom:1.5rem;">
        <div class="table-controls" style="margin-bottom:0;">
            <div class="search-filter-group">
                <div class="input-wrapper" style="flex:1;">
                    <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" class="form-input" id="rep-clientes-search"
                        placeholder="Buscar por nombre o NIT / identificación..."
                        oninput="filterReportClientes()" value="${escapeHtml(_repClientesSearch)}">
                </div>
            </div>
            <div style="display:flex; gap:.75rem; flex-shrink:0;">
                <button class="btn btn-secondary btn-sm" onclick="exportReportPorCliente()" style="height:42px;">
                    ${_reportExportIcon()} Exportar Excel
                </button>
            </div>
        </div>
    </div>

    <div class="stats-grid" style="margin-bottom:1.5rem;">
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Clientes</span></div>
            <div class="stat-value">${withStats.length}</div>
        </div>
        <div class="card stat-card">
            <div class="stat-header"><span class="stat-title">Ingresos Totales (histórico)</span></div>
            <div class="stat-value">${formatCurrency(totalRevenue)}</div>
        </div>
    </div>

    <div class="card">
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>NIT / Identificación</th>
                        <th style="text-align:center;">Compras</th>
                        <th>Última Compra</th>
                        <th style="text-align:right;">Valor Total Histórico</th>
                    </tr>
                </thead>
                <tbody>
                    ${withStats.length ? withStats.map(({ cliente, stats }) => `
                        <tr>
                            <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(cliente.nombre)}</td>
                            <td style="font-family:'JetBrains Mono',monospace; font-size:.85rem;">${escapeHtml(cliente.nit) || '—'}</td>
                            <td style="text-align:center;">${stats.count}</td>
                            <td>${stats.lastDate || '—'}</td>
                            <td style="text-align:right; font-weight:600; color:var(--text-primary);">${formatCurrency(stats.totalValue)}</td>
                        </tr>`).join('') : `
                        <tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:3rem 0;">No se encontraron clientes.</td></tr>`}
                </tbody>
            </table>
        </div>
    </div>`;
}

function exportReportPorCliente() {
    const withStats = _computeClientesReportRows();
    if (withStats.length === 0) {
        triggerToast('error', 'No hay clientes para exportar.');
        return;
    }
    const headers = ['Cliente', 'NIT/ID', 'Facturas', 'Última Compra', 'Ingresos Totales'];
    const rows = withStats.map(({ cliente, stats }) => [
        cliente.nombre, cliente.nit || '', stats.count, stats.lastDate || '', stats.totalValue.toFixed(2)
    ]);
    const ok = _exportReportXLSX(`AUREO_Reporte_PorCliente_${_reportDateStr()}.xlsx`, 'PorCliente', headers, rows);
    if (ok) triggerToast('success', `Reporte por cliente exportado correctamente (${withStats.length} clientes).`);
}

// --------------------------------------------------------------------------
//   ICONO COMPARTIDO (botones "Exportar Excel")
// --------------------------------------------------------------------------
function _reportExportIcon() {
    return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem; vertical-align:-2px;">
        <path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
        <line x1="9" y1="15" x2="15" y2="15"/><line x1="12" y1="12" x2="12" y2="18"/>
    </svg>`;
}
