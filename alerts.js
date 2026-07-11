// AUREO — ALERTAS PROACTIVAS: motor de reglas simples sobre datos ya existentes
// (clientes, productos, facturas). No es un módulo de captura de datos nuevo:
// sólo lee state.clients / state.products / state.invoices y calcula alertas
// al vuelo, igual que ABC/WMS y las estadísticas de clientes (sin caché).
//
// Se recalcula en cada render del Dashboard vía computeAlerts() — no hay
// polling, setInterval ni service worker. Ver hook en dashboard.js (renderDashboard).

// --------------------------------------------------------------------------
//   CONFIGURACIÓN DE REGLAS
// --------------------------------------------------------------------------
const ALERT_CLIENTE_INACTIVO_DIAS = 45; // más de N días desde la última compra
const ALERT_MAX_VISIBLE = 10;           // tope combinado antes de "ver todas"

// v1 de solo lectura: no hay "descartar alerta" persistido todavía (a
// propósito, para mantener el módulo simple — ver nota en el reporte).
let alertsShowAll = false;

// --------------------------------------------------------------------------
//   REGLA 1 — CLIENTE INACTIVO
//   Se reutiliza computeClientStats() de clients.js (mismo cálculo que
//   alimenta la ficha de cliente). Un cliente sin ninguna compra histórica
//   no tiene "última compra" de la cual estar inactivo, así que se excluye
//   explícitamente: no hay señal real y evita alertar sobre todo el
//   catálogo de clientes recién creados sin facturas.
// --------------------------------------------------------------------------
function computeClientInactivityAlerts() {
    const today = new Date();
    const alerts = [];

    (state.clients || []).forEach(cliente => {
        const stats = computeClientStats(cliente);
        if (stats.count === 0 || !stats.lastDate) return; // sin historial: no aplica

        const lastPurchase = new Date(stats.lastDate + 'T00:00:00');
        const daysSince = Math.floor((today - lastPurchase) / 86400000);
        if (daysSince <= ALERT_CLIENTE_INACTIVO_DIAS) return;

        alerts.push({
            type: 'cliente_inactivo',
            key: `cliente_inactivo:${cliente.id}`,
            severity: daysSince,
            message: `Cliente ${escapeHtml(cliente.nombre)} no compra hace ${daysSince} días`,
            actionLabel: 'Ver ficha',
            onAction: `openClientDetail('${cliente.id}')`
        });
    });

    return alerts;
}

// --------------------------------------------------------------------------
//   REGLA 2 — PRODUCTO BAJO PUNTO DE REORDEN
//   Todavía no existe un campo explícito "reorderPoint" por producto.
//   calculateABCClassification() (wms.js) sólo clasifica rotación (A/B/C),
//   no define un punto de reorden. Se reutiliza en su lugar el campo
//   `threshold` que YA existe por producto y que ya alimenta el KPI
//   "Alertas Críticas" del dashboard (stock <= threshold) — es el proxy más
//   cercano disponible hoy. Cuando se modele un punto de reorden real (con
//   lead time / velocidad de venta), esta regla debe apuntar a ese campo
//   en vez de `threshold`.
//
//   getLowStockProducts() es la ÚNICA fuente de verdad para esta regla: la
//   consume tanto esta alerta como la Solicitud de Pedido de Compras
//   (purchasing.js), para que ambos módulos siempre coincidan en qué
//   productos están bajo su punto de reorden.
// --------------------------------------------------------------------------
function getLowStockProducts() {
    return (state.products || []).filter(p => {
        const stock = Number(p.stock);
        const threshold = Number(p.threshold);
        if (isNaN(stock) || isNaN(threshold)) return false;
        return stock <= threshold;
    });
}

function computeLowStockAlerts() {
    return getLowStockProducts().map(p => {
        const stock = Number(p.stock);
        const threshold = Number(p.threshold);
        const deficit = threshold - stock; // 0 cuando stock == threshold
        return {
            type: 'stock_bajo',
            key: `stock_bajo:${p.id}`,
            severity: deficit,
            message: `Producto ${escapeHtml(p.sku || p.name)} por debajo del punto de reorden (stock: ${stock}, mínimo: ${threshold})`,
            actionLabel: 'Ver inventario',
            onAction: `switchTab('inventory')`
        };
    });
}

// --------------------------------------------------------------------------
//   REGLA 3 — FACTURA PENDIENTE
//   invoicing.js sólo crea facturas con status "paid" (no hay flujo de UI
//   para crédito/vencimiento), pero el modelo de datos SÍ contempla otros
//   valores de status (demo-data.js siembra algunas facturas "pending").
//   No existe un campo de fecha de vencimiento / plazo de crédito, así que
//   la severidad se basa únicamente en la antigüedad de la factura
//   (fecha de emisión), no en días de mora reales.
// --------------------------------------------------------------------------
function computePendingInvoiceAlerts() {
    const today = new Date();
    const alerts = [];

    (state.invoices || []).forEach(inv => {
        if (!inv || inv.status === 'paid' || !inv.date) return;

        const invDate = new Date(inv.date + 'T00:00:00');
        const daysSince = Math.floor((today - invDate) / 86400000);
        alerts.push({
            type: 'factura_pendiente',
            key: `factura_pendiente:${inv.id}`,
            severity: daysSince,
            message: `Factura ${inv.id} de ${escapeHtml(inv.clientName || 'Consumidor Final')} pendiente de pago hace ${daysSince} días`,
            actionLabel: 'Ver facturación',
            onAction: `switchTab('invoicing')`
        });
    });

    return alerts;
}

// --------------------------------------------------------------------------
//   MOTOR — combina las 3 reglas y ordena por severidad descendente.
//   La severidad no es 100% comparable entre tipos (días vs. unidades de
//   déficit de stock), es un orden heurístico sólo para decidir qué mostrar
//   primero en el panel, no un cálculo de riesgo financiero.
// --------------------------------------------------------------------------
function computeAlerts() {
    return [
        ...computeClientInactivityAlerts(),
        ...computeLowStockAlerts(),
        ...computePendingInvoiceAlerts()
    ].sort((a, b) => b.severity - a.severity);
}

// --------------------------------------------------------------------------
//   RENDER — panel del Dashboard, mismo patrón que renderOccupancySection /
//   renderFreshnessSection (wms.js): un <div id="dashboard-..."></div> fijo
//   en index.html que se repuebla por completo en cada llamada.
// --------------------------------------------------------------------------
const ALERT_TYPE_META = {
    cliente_inactivo: {
        label: 'Clientes inactivos',
        color: 'var(--accent-gold)',
        bg: 'rgba(46, 74, 110, 0.08)',
        border: 'rgba(46, 74, 110, 0.15)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
    },
    stock_bajo: {
        label: 'Productos bajo punto de reorden',
        color: 'var(--accent-rose)',
        bg: 'rgba(168, 68, 44, 0.08)',
        border: 'rgba(168, 68, 44, 0.15)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
    },
    factura_pendiente: {
        label: 'Facturas pendientes',
        color: 'var(--accent-cyan)',
        bg: 'rgba(60, 90, 115, 0.08)',
        border: 'rgba(60, 90, 115, 0.15)',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    }
};

function toggleAlertsShowAll() {
    alertsShowAll = !alertsShowAll;
    renderAlertsSection();
}

function renderAlertsSection() {
    const el = document.getElementById('dashboard-alerts-section');
    if (!el) return;

    const allAlerts = computeAlerts();
    const totalCount = allAlerts.length;

    const headerIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="margin-right:.4rem;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

    if (totalCount === 0) {
        el.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${headerIcon}Alertas Proactivas</h2>
                    <span class="badge badge-success">Sin novedades</span>
                </div>
                <div style="text-align:center; color: var(--text-muted); padding: 2rem;">
                    No hay alertas activas por ahora.
                </div>
            </div>`;
        return;
    }

    const visible = alertsShowAll ? allAlerts : allAlerts.slice(0, ALERT_MAX_VISIBLE);

    // Agrupar (preservando el orden por severidad ya aplicado en computeAlerts)
    const groups = {};
    visible.forEach(a => {
        if (!groups[a.type]) groups[a.type] = [];
        groups[a.type].push(a);
    });

    const groupsHtml = Object.keys(ALERT_TYPE_META)
        .filter(t => groups[t] && groups[t].length > 0)
        .map(t => {
            const meta = ALERT_TYPE_META[t];
            const items = groups[t].map(a => `
                <div class="activity-item">
                    <div class="activity-details">
                        <div class="activity-icon-box" style="background-color:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border};">
                            ${meta.icon}
                        </div>
                        <div class="activity-text-info">
                            <span class="activity-title">${a.message}</span>
                        </div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="${a.onAction}">${a.actionLabel}</button>
                </div>
            `).join('');

            return `
                <div style="margin-bottom:1.25rem;">
                    <div style="font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:.6rem;">
                        ${meta.label} <span class="badge badge-danger" style="margin-left:.4rem;">${groups[t].length}</span>
                    </div>
                    <div class="activity-list">${items}</div>
                </div>`;
        }).join('');

    el.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h2 class="card-title">${headerIcon}Alertas Proactivas</h2>
                <span class="badge badge-danger">${totalCount} activa${totalCount === 1 ? '' : 's'}</span>
            </div>
            ${groupsHtml}
            ${totalCount > ALERT_MAX_VISIBLE ? `
                <div style="text-align:center; margin-top:.25rem;">
                    <button class="btn btn-secondary btn-sm" onclick="toggleAlertsShowAll()">
                        ${alertsShowAll ? 'Ver menos' : `Ver todas (${totalCount})`}
                    </button>
                </div>` : ''}
        </div>`;
}
