// AUREO — MÓDULO: PREPARACIÓN DE PEDIDOS (PICKING INTELIGENTE)

// ==========================================================================
//   MÓDULO: PREPARACIÓN DE PEDIDOS (PICKING INTELIGENTE)
//   Recorrido de bodega · productos por vencer · stock comprometido
// ==========================================================================

// --- Catálogo de estados (lenguaje simple para operarios) ---
const PICKING_STATUS = {
    pendiente: { label: 'Pendiente', badge: 'badge-warning', dot: 'var(--accent-gold)', next: 'Iniciar preparación' },
    en_proceso: { label: 'Preparando', badge: 'badge-info', dot: 'var(--accent-cyan)', next: 'Finalizar' },
    parcial: { label: 'Incompleto', badge: 'badge-warning', dot: 'var(--accent-gold)', next: 'Despachar parcial' },
    completado: { label: 'Listo', badge: 'badge-success', dot: 'var(--accent-emerald)', next: 'Despachar' },
    despachado: { label: 'Despachado', badge: 'badge-success', dot: 'var(--accent-emerald)', next: '' },
    cancelado: { label: 'Cancelado', badge: 'badge-danger', dot: 'var(--accent-rose)', next: '' }
};

const PICKING_PRIORITY = {
    alta: { label: 'Urgente', badge: 'badge-danger', color: 'var(--accent-rose)' },
    media: { label: 'Normal', badge: 'badge-info', color: '#4A7AB5' },
    baja: { label: 'Sin prisa', badge: 'badge-success', color: 'var(--accent-emerald)' }
};

// Orden físico de pasillos (cercano → lejano al muelle de despacho)
const AISLE_ORDER = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };

// Draft para creación manual de lista de picking
let _newPickItems = [];

const PICKING_SUB_META = {
    panel: { title: 'Resumen', desc: 'Indicadores de preparación de pedidos.' },
    nueva: { title: 'Nueva lista', desc: 'Pedidos listos para preparar.' },
    proceso: { title: 'En preparación', desc: 'Pedidos que se están recogiendo ahora.' },
    completado: { title: 'Preparados', desc: 'Pedidos listos o ya despachados.' },
    comprometido: { title: 'Stock comprometido', desc: 'Unidades reservadas por pedidos en curso.' },
    pendientes: { title: 'Productos pendientes', desc: 'Lo que aún falta por recoger.' },
    historial: { title: 'Historial', desc: 'Registro de movimientos y cambios.' }
};

const PICKING_SESSION = (typeof getVulcanSession === 'function' && getVulcanSession()) || null;

// --- Persistencia ---
function savePickingToStorage() {
    localStorage.setItem('aura_picking', JSON.stringify(state.pickingLists));
    apiPut('/api/picking', state.pickingLists);
}

function loadPickingLists() {
    const stored = localStorage.getItem('aura_picking');
    if (stored) {
        try { state.pickingLists = JSON.parse(stored); } catch (e) { state.pickingLists = []; }
    } else {
        seedPickingDemo();
        savePickingToStorage();
    }
    syncPickingWithInvoices();
}

// Genera listas de picking para todas las facturas que todavía no tienen una.
// Se ejecuta al arrancar y cada vez que se carga el módulo, sin sobrescribir
// listas existentes. Silencioso: no muestra toasts ni redirige.
function syncPickingWithInvoices() {
    const withList = new Set(state.pickingLists.map(l => l.orderRef));
    let added = 0;
    state.invoices.forEach(inv => {
        if (withList.has(inv.id)) return;
        if (!inv.items || inv.items.length === 0) return;
        const items = inv.items.map(line => {
            const product = state.products.find(p => p.id === line.productId);
            if (product) return buildPickItem(product, line.qty);
            return {
                productId: line.productId, name: line.name, sku: '—', category: '—',
                requestedQty: line.qty, pickedQty: 0, picked: false, status: 'pendiente',
                warehouse: '', aisle: '', shelf: 0, level: 0, pickingDistance: 99,
                location: '', lot: '', expDate: '', lots: [], stockSnapshot: 0
            };
        });
        const ordered = sortByRoute(items);
        state.pickingLists.push({
            id: nextPickingId(),
            orderRef: inv.id,
            type: 'Factura',
            clientName: inv.clientName,
            clientId: inv.clientId,
            date: inv.date || new Date().toISOString().split('T')[0],
            createdAt: Date.now(),
            status: 'pendiente',
            operator: 'Sin asignar',
            priority: 'media',
            estimatedSec: estimatePickingTime(ordered),
            startedAt: null,
            finishedAt: null,
            items: ordered,
            history: [{ ts: Date.now(), action: 'Creada', detail: `Sincronizada desde ${inv.id}`, by: 'Sistema' }]
        });
        withList.add(inv.id);
        added++;
    });
    if (added > 0) savePickingToStorage();
}

// --- Helpers de ubicación / formato ---
function pad2(n) { return String(n).padStart(2, '0'); }

function buildLocationCode(p) {
    if (!p || !p.aisle) return '';
    return `${p.aisle}-${pad2(p.shelf || 1)}-${pad2(p.level || 1)}`;
}

function zoneLabel(aisle) {
    const zones = {
        'A': 'Zona Rápida',
        'B': 'Zona Media',
        'C': 'Zona Profunda',
        'D': 'Patio Lejano'
    };
    return zones[aisle] || 'Sin zona';
}

function formatDuration(sec) {
    if (!sec || sec < 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${pad2(s)}s`;
}

function daysToExpiry(expDate) {
    if (!expDate) return null;
    const exp = new Date(expDate + 'T00:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// --- LÓGICA "PRIMERO EN VENCER, PRIMERO EN SALIR" ---
// Devuelve los lotes de un producto ordenados por fecha de vencimiento (más próximo primero).
function getProductLots(product) {
    if (product.lots && product.lots.length) {
        return [...product.lots].sort((a, b) => (a.expDate || '').localeCompare(b.expDate || ''));
    }
    // Si el producto sólo trae un lote, generamos lotes de demostración para
    // mostrar visualmente cómo el sistema elige el que vence primero.
    const stock = Math.max(Number(product.stock) || 0, 1);
    const base = product.expDate ? new Date(product.expDate + 'T00:00:00') : new Date();
    const mk = (offsetDays, frac, suffix) => {
        const d = new Date(base);
        d.setDate(d.getDate() + offsetDays);
        return {
            code: `${product.lot || 'LT'}-${suffix}`,
            expDate: d.toISOString().split('T')[0],
            qty: Math.max(1, Math.round(stock * frac))
        };
    };
    return [mk(-35, 0.35, 'A'), mk(0, 0.40, 'B'), mk(55, 0.25, 'C')]
        .sort((a, b) => a.expDate.localeCompare(b.expDate));
}

function selectFEFOLot(product) {
    const lots = getProductLots(product);
    return lots[0] || null;
}

// --- Recorrido óptimo: ordena los productos por cercanía dentro de la bodega ---
function sortByRoute(items) {
    return [...items].sort((a, b) => {
        const az = AISLE_ORDER[a.aisle] || 9;
        const bz = AISLE_ORDER[b.aisle] || 9;
        if (az !== bz) return az - bz;
        if ((a.shelf || 0) !== (b.shelf || 0)) return (a.shelf || 0) - (b.shelf || 0);
        return (a.pickingDistance || 0) - (b.pickingDistance || 0);
    });
}

// Tiempo estimado de preparación (segundos): base por línea + caminata por distancia
function estimatePickingTime(items) {
    let sec = 0;
    items.forEach(it => {
        sec += 25;                          // tomar y validar el producto
        sec += (it.requestedQty || 1) * 4;  // por cada unidad
        sec += (it.pickingDistance || 10) * 1.5; // caminata ida/vuelta
    });
    return Math.round(sec);
}

// --- STOCK COMPROMETIDO ---
// Unidades reservadas por pedidos activos (pendientes / en preparación / incompletos)
function getCommittedStock(productId) {
    let committed = 0;
    state.pickingLists.forEach(list => {
        if (!['pendiente', 'en_proceso', 'parcial'].includes(list.status)) return;
        list.items.forEach(it => {
            if (it.productId === productId) {
                committed += Math.max(0, (it.requestedQty || 0) - (it.pickedQty || 0));
            }
        });
    });
    return committed;
}

function getAvailableStock(productId) {
    const prod = state.products.find(p => p.id === productId);
    if (!prod) return 0;
    return Math.max(0, Number(prod.stock) - getCommittedStock(productId));
}

// --- ID incremental de lista ---
function nextPickingId() {
    let max = 0;
    state.pickingLists.forEach(l => {
        const m = /PICK-\d{4}-(\d+)/.exec(l.id);
        if (m) max = Math.max(max, parseInt(m[1]));
    });
    return `PICK-2026-${String(max + 1).padStart(4, '0')}`;
}

// --- Construir item de picking a partir de un producto + cantidad ---
function buildPickItem(product, qty) {
    const fefo = selectFEFOLot(product);
    return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        requestedQty: qty,
        pickedQty: 0,
        picked: false,
        status: 'pendiente',
        warehouse: product.warehouse || 'Bodega Principal',
        aisle: product.aisle || '',
        shelf: product.shelf || 1,
        level: product.level || 1,
        pickingDistance: product.pickingDistance || 15,
        location: buildLocationCode(product),
        lot: fefo ? fefo.code : (product.lot || ''),
        expDate: fefo ? fefo.expDate : (product.expDate || ''),
        lots: getProductLots(product),
        stockSnapshot: Number(product.stock) || 0
    };
}

// --- GENERACIÓN AUTOMÁTICA DESDE FACTURA / PEDIDO / ORDEN ---
function generatePickingFromInvoice(invoice, opts = {}) {
    if (!invoice || !invoice.items || invoice.items.length === 0) return null;

    const items = invoice.items.map(line => {
        const product = state.products.find(p => p.id === line.productId);
        if (product) return buildPickItem(product, line.qty);
        // Producto que ya no está en catálogo
        return {
            productId: line.productId, name: line.name, sku: '—', category: '—',
            requestedQty: line.qty, pickedQty: 0, picked: false, status: 'pendiente',
            warehouse: '', aisle: '', shelf: 0, level: 0, pickingDistance: 99,
            location: '', lot: '', expDate: '', lots: [], stockSnapshot: 0
        };
    });

    const ordered = sortByRoute(items);
    const list = {
        id: nextPickingId(),
        orderRef: invoice.id,
        type: 'Factura',
        clientName: invoice.clientName,
        clientId: invoice.clientId,
        date: invoice.date || new Date().toISOString().split('T')[0],
        createdAt: Date.now(),
        status: 'pendiente',
        operator: 'Sin asignar',
        priority: 'media',
        estimatedSec: estimatePickingTime(ordered),
        startedAt: null,
        finishedAt: null,
        items: ordered,
        history: [{ ts: Date.now(), action: 'Creada', detail: `Generada desde ${invoice.id}`, by: 'Sistema' }]
    };

    state.pickingLists.push(list);
    savePickingToStorage();

    if (!opts.silent) {
        triggerToast('success', `Lista de preparación ${list.id} creada para ${escapeHtml(list.clientName)}.`);
        if (state.activeTab === 'picking') renderPicking();
    }
    return list;
}

// --- Datos de demostración (para que el módulo no aparezca vacío) ---
function seedPickingDemo() {
    state.pickingLists = [];
    const sources = (state.invoices && state.invoices.length) ? state.invoices : [];
    sources.forEach((inv, idx) => {
        const list = generatePickingFromInvoice(inv, { silent: true });
        if (!list) return;

        if (idx === 0) {
            // Pedido ya despachado (todo recogido)
            list.operator = 'Jefe de Depósito';
            list.priority = 'media';
            list.status = 'despachado';
            list.startedAt = list.createdAt + 60000;
            list.finishedAt = list.startedAt + 185000;
            list.items.forEach(it => { it.pickedQty = it.requestedQty; it.picked = true; it.status = 'recogido'; });
            list.history.push({ ts: list.finishedAt, action: 'Despachado', detail: 'Pedido entregado a transporte', by: 'Jefe de Depósito' });
        } else if (idx === 1) {
            // Pedido en preparación (a medias)
            list.operator = 'Jefe de Depósito';
            list.priority = 'alta';
            list.status = 'en_proceso';
            list.startedAt = Date.now() - 140000;
            if (list.items[0]) { list.items[0].pickedQty = list.items[0].requestedQty; list.items[0].picked = true; list.items[0].status = 'recogido'; }
            list.history.push({ ts: list.startedAt, action: 'Iniciada', detail: 'Comenzó la preparación', by: 'Jefe de Depósito' });
        } else {
            // Pedido pendiente sin asignar
            list.priority = 'baja';
            list.status = 'pendiente';
        }
    });
    savePickingToStorage();
}

// ==========================================================================
//   RENDER PRINCIPAL DEL MÓDULO
// ==========================================================================
function renderPicking() {
    // Marcar sub-pestaña activa
    document.querySelectorAll('.picking-subtab').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`picksub-${state.activePickingSub}`);
    if (activeBtn) activeBtn.classList.add('active');

    renderPickingAlerts();

    const sub = state.activePickingSub;
    switch (sub) {
        case 'panel': renderPickingPanel(); break;
        case 'nueva': renderPickingNew(); break;
        case 'proceso': renderPickingActive(); break;
        case 'completado': renderPickingCompleted(); break;
        case 'comprometido': renderCommittedStock(); break;
        case 'pendientes': renderPendingProducts(); break;
        case 'historial': renderPickingHistory(); break;
        default: renderPickingPanel();
    }
}

function switchPickingSub(sub) {
    state.activePickingSub = sub;
    renderPicking();
}

// --- Badge de cantidad en cada sub-pestaña ---
function refreshPickingTabCounts() {
    const counts = {
        nueva: state.invoices.filter(inv => !state.pickingLists.some(l => l.orderRef === inv.id)).length,
        proceso: state.pickingLists.filter(l => ['pendiente', 'en_proceso', 'parcial'].includes(l.status)).length,
        completado: state.pickingLists.filter(l => ['completado', 'despachado'].includes(l.status)).length
    };
    Object.entries(counts).forEach(([k, v]) => {
        const el = document.getElementById(`pickcount-${k}`);
        if (el) { el.innerText = v; el.style.display = v > 0 ? 'inline-flex' : 'none'; }
    });
}

// ==========================================================================
//   ALERTAS AUTOMÁTICAS
// ==========================================================================
function computePickingAlerts() {
    const alerts = [];
    const seen = new Set();

    state.pickingLists.forEach(list => {
        if (!['pendiente', 'en_proceso', 'parcial'].includes(list.status)) return;

        list.items.forEach(it => {
            const remaining = (it.requestedQty || 0) - (it.pickedQty || 0);
            if (remaining <= 0) return;

            // Stock insuficiente
            const prod = state.products.find(p => p.id === it.productId);
            const phys = prod ? Number(prod.stock) : 0;
            if (phys < it.requestedQty) {
                const key = 'stock-' + it.productId;
                if (!seen.has(key)) {
                    seen.add(key);
                    alerts.push({ type: 'danger', icon: 'alert', msg: `Stock insuficiente: ${it.name.split(' ').slice(0, 3).join(' ')} (pide ${it.requestedQty}, hay ${phys}).` });
                }
            }

            // Producto sin ubicación
            if (!it.aisle) {
                const key = 'loc-' + it.productId;
                if (!seen.has(key)) {
                    seen.add(key);
                    alerts.push({ type: 'warning', icon: 'pin', msg: `Producto sin ubicación: ${it.name.split(' ').slice(0, 3).join(' ')}.` });
                }
            }

            // Producto por vencer
            const d = daysToExpiry(it.expDate);
            if (d !== null && d <= 30) {
                const key = 'exp-' + it.productId;
                if (!seen.has(key)) {
                    seen.add(key);
                    const txt = d < 0 ? 'vencido' : `vence en ${d} día${d === 1 ? '' : 's'}`;
                    alerts.push({ type: d < 0 ? 'danger' : 'warning', icon: 'clock', msg: `Producto por vencer: ${it.name.split(' ').slice(0, 3).join(' ')} (${txt}).` });
                }
            }
        });

        // Preparación detenida (iniciada hace mucho sin terminar)
        if (list.status === 'en_proceso' && list.startedAt && (Date.now() - list.startedAt) > 30 * 60 * 1000) {
            alerts.push({ type: 'warning', icon: 'pause', msg: `Preparación detenida: ${list.id} lleva mucho tiempo sin avanzar.` });
        }
    });

    return alerts;
}

function renderPickingAlerts() {
    const container = document.getElementById('picking-alerts');
    if (!container) return;
    refreshPickingTabCounts();

    const alerts = computePickingAlerts();
    if (alerts.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = alerts.slice(0, 6).map(a => `
        <div class="picking-alert-chip alert-${a.type}">
            ${pickIcon(a.icon)}
            <span>${a.msg}</span>
        </div>
    `).join('');
}

// --- Iconos SVG reutilizables ---
function pickIcon(name) {
    const icons = {
        alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
        box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
        play: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        printer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    };
    return icons[name] || '';
}

// --- Cálculo de progreso de una lista ---
function listProgress(list) {
    const itemsTotal = list.items.length;
    let itemsDone = 0, totalReq = 0, totalPicked = 0;
    list.items.forEach(it => {
        totalReq += it.requestedQty || 0;
        totalPicked += it.pickedQty || 0;
        if ((it.pickedQty || 0) >= (it.requestedQty || 0)) itemsDone++;
    });
    const pct = totalReq > 0 ? Math.round((totalPicked / totalReq) * 100) : 0;
    return { itemsTotal, itemsDone, totalReq, totalPicked, pct, remainingUnits: totalReq - totalPicked, remainingItems: itemsTotal - itemsDone };
}

function elapsedSeconds(list) {
    if (!list.startedAt) return 0;
    const end = list.finishedAt || Date.now();
    return Math.round((end - list.startedAt) / 1000);
}

// ==========================================================================
//   SUB-VISTA: PANEL / RESUMEN
// ==========================================================================
function renderPickingPanel() {
    const c = document.getElementById('picking-content');
    const lists = state.pickingLists;

    const pendientes = lists.filter(l => ['pendiente', 'en_proceso', 'parcial'].includes(l.status)).length;
    const completados = lists.filter(l => ['completado', 'despachado'].includes(l.status)).length;
    const parciales = lists.filter(l => l.status === 'parcial').length;

    // Tiempo promedio de preparación
    const timed = lists.filter(l => l.startedAt && l.finishedAt);
    const avgSec = timed.length ? Math.round(timed.reduce((s, l) => s + elapsedSeconds(l), 0) / timed.length) : 0;

    // Eficiencia operativa: % de unidades recogidas sobre solicitadas en pedidos finalizados
    let reqF = 0, pickF = 0;
    lists.filter(l => ['completado', 'despachado', 'parcial'].includes(l.status)).forEach(l => {
        const p = listProgress(l); reqF += p.totalReq; pickF += p.totalPicked;
    });
    const efficiency = reqF > 0 ? Math.round((pickF / reqF) * 100) : 100;

    // Productividad por operario (unidades recogidas)
    const opMap = {};
    lists.forEach(l => {
        if (l.operator && l.operator !== 'Sin asignar') {
            opMap[l.operator] = (opMap[l.operator] || 0) + listProgress(l).totalPicked;
        }
    });
    const opRows = Object.entries(opMap).map(([k, v]) => ({ label: k, value: v }));

    // Movimientos por zona
    const zoneMap = {};
    lists.forEach(l => l.items.forEach(it => {
        const z = it.aisle ? `Pasillo ${it.aisle}` : 'Sin zona';
        zoneMap[z] = (zoneMap[z] || 0) + (it.pickedQty || 0);
    }));
    const zoneRows = Object.entries(zoneMap).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ label: k, value: v }));

    // Productos con mayor movimiento
    const moveMap = {};
    lists.forEach(l => l.items.forEach(it => {
        moveMap[it.name] = (moveMap[it.name] || 0) + (it.pickedQty || 0);
    }));
    const topMoved = Object.entries(moveMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ label: k, value: v }));

    // Productos por vencer (en pedidos activos)
    const expiring = [];
    const seenExp = new Set();
    lists.filter(l => ['pendiente', 'en_proceso', 'parcial'].includes(l.status)).forEach(l => l.items.forEach(it => {
        const d = daysToExpiry(it.expDate);
        if (d !== null && d <= 60 && !seenExp.has(it.productId)) {
            seenExp.add(it.productId);
            expiring.push({ name: it.name, days: d, lot: it.lot });
        }
    }));
    expiring.sort((a, b) => a.days - b.days);

    c.innerHTML = `
        <div class="stats-grid">
            ${pickStatCard('gold', 'Pedidos por preparar', pendientes, pickIcon('box'), 'en cola y en curso')}
            ${pickStatCard('emerald', 'Pedidos preparados', completados, pickIcon('check'), 'listos y despachados')}
            ${pickStatCard('cyan', 'Tiempo promedio', formatDuration(avgSec), pickIcon('clock'), 'por pedido')}
            ${pickStatCard('rose', 'Pedidos incompletos', parciales, pickIcon('alert'), 'faltaron productos')}
        </div>

        <div class="dashboard-main-grid">
            <div class="card">
                <div class="card-header"><h2 class="card-title">${pickIcon('check')} Eficiencia de preparación</h2>
                    <span class="badge ${efficiency >= 90 ? 'badge-success' : efficiency >= 70 ? 'badge-warning' : 'badge-danger'}">${efficiency}%</span></div>
                <div class="pick-progress-track" style="height:14px; margin:0.5rem 0 1.5rem;">
                    <div class="pick-progress-fill" style="width:${efficiency}%; background:var(--accent-emerald-gradient);"></div>
                </div>
                <h3 class="pick-mini-title">Productividad por operario (uds recogidas)</h3>
                ${barChart(opRows, 'var(--accent-cyan-gradient)') || emptyMini('Aún no hay operarios asignados.')}
                <h3 class="pick-mini-title" style="margin-top:1.5rem;">Movimientos por zona de bodega</h3>
                ${barChart(zoneRows, 'var(--accent-gold-gradient)') || emptyMini('Sin movimientos registrados.')}
            </div>

            <div class="card">
                <div class="card-header"><h2 class="card-title">${pickIcon('clock')} Productos por vencer</h2>
                    <span class="badge badge-warning">${expiring.length}</span></div>
                <div class="pick-expiry-list">
                    ${expiring.length === 0 ? emptyMini('Ningún producto próximo a vencer en los pedidos activos. 👍') :
            expiring.slice(0, 6).map(e => `
                            <div class="pick-expiry-row">
                                <div>
                                    <div class="pick-expiry-name">${e.name}</div>
                                    <div class="pick-expiry-lot">Lote ${e.lot || '—'}</div>
                                </div>
                                <span class="badge ${e.days < 0 ? 'badge-danger' : e.days <= 15 ? 'badge-warning' : 'badge-info'}">
                                    ${e.days < 0 ? 'Vencido' : e.days + ' días'}
                                </span>
                            </div>`).join('')}
                </div>
                <h3 class="pick-mini-title" style="margin-top:1.5rem;">Productos con mayor movimiento</h3>
                ${barChart(topMoved, 'var(--accent-emerald-gradient)') || emptyMini('Sin movimientos todavía.')}
            </div>
        </div>
    `;
}

function pickStatCard(color, title, value, icon, period) {
    return `
        <div class="card stat-card stat-${color}">
            <div class="stat-header">
                <span class="stat-title">${title}</span>
                <div class="stat-icon-wrapper">${icon}</div>
            </div>
            <div class="stat-value">${value}</div>
            <div class="stat-meta"><span class="stat-period">${period}</span></div>
        </div>`;
}

function barChart(rows, gradient) {
    if (!rows || rows.length === 0) return '';
    const max = Math.max(...rows.map(r => r.value), 1);
    return `<div class="pick-barchart">` + rows.map(r => `
        <div class="pick-bar-row">
            <span class="pick-bar-label" title="${r.label}">${r.label}</span>
            <div class="pick-bar-track"><div class="pick-bar-fill" style="width:${(r.value / max) * 100}%; background:${gradient};"></div></div>
            <span class="pick-bar-value">${r.value}</span>
        </div>`).join('') + `</div>`;
}

function emptyMini(msg) {
    return `<div class="pick-empty-mini">${msg}</div>`;
}

// ==========================================================================
//   SUB-VISTA: NUEVA LISTA (pedidos listos para preparar)
// ==========================================================================
function renderPickingNew() {
    const c = document.getElementById('picking-content');
    const withList = new Set(state.pickingLists.map(l => l.orderRef));
    const pending = state.invoices.filter(inv => !withList.has(inv.id));

    c.innerHTML = `
        <!-- ═══ CREACIÓN MANUAL DE LISTA ═══ -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h2 class="card-title">${pickIcon('play')} Crear lista de picking manualmente</h2>
            </div>
            <p class="pick-help" style="margin-bottom:1rem;">
                Ingresa el SKU de cada producto para autocompletar su información de bodega, luego envía la lista directamente a facturación.
            </p>

            <!-- Datos del pedido -->
            <div class="resp-collapse-600" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:1rem;margin-bottom:1.2rem;align-items:end;">
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Cliente / Razón Social</label>
                    <input type="text" class="form-input" id="np-client" placeholder="Nombre del cliente">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">NIT / Cédula Cliente</label>
                    <input type="text" class="form-input" id="np-client-id" placeholder="NIT 900.XXX.XXX-X o CC XX.XXX.XXX">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Operario asignado</label>
                    <input type="text" class="form-input" id="np-operator" placeholder="Nombre del operario">
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">Prioridad</label>
                    <select class="form-select" id="np-priority">
                        <option value="media">Normal</option>
                        <option value="alta">Urgente</option>
                        <option value="baja">Sin prisa</option>
                    </select>
                </div>
            </div>

            <!-- Buscador de SKU -->
            <div style="background:var(--bg-secondary,#16162a);border:1px solid var(--border-color,#2a2a4a);border-radius:10px;padding:1.2rem;margin-bottom:1rem;">
                <div style="font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:.8rem;">
                    Agregar producto por SKU
                </div>
                <div class="resp-collapse-600" style="display:grid;grid-template-columns:160px 1fr 80px auto;gap:.75rem;align-items:end;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">SKU</label>
                        <input type="text" class="form-input" id="np-sku"
                               placeholder="Ej: SKU-BOSC-1500"
                               oninput="pickSKULookup(this.value)"
                               onkeydown="if(event.key==='Enter')addItemToNewPick()"
                               style="font-family:'JetBrains Mono',monospace;text-transform:uppercase;">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">Producto encontrado</label>
                        <input type="text" class="form-input" id="np-found-name" readonly placeholder="— ingresa un SKU válido —"
                               style="background:var(--bg-tertiary,#1e1e38);color:var(--text-muted);">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">Cantidad</label>
                        <input type="number" class="form-input" id="np-qty" value="1" min="1">
                    </div>
                    <button class="btn btn-primary" onclick="addItemToNewPick()" id="np-add-btn" disabled>
                        + Agregar
                    </button>
                </div>
                <!-- Ficha del producto encontrado -->
                <div id="np-product-card" style="display:none;margin-top:.9rem;padding:.75rem 1rem;border-radius:8px;background:var(--bg-card,#1a1a30);border:1px solid var(--accent-cyan,#2E4A6E);font-size:0.82rem;display:none;">
                    <div style="display:flex;gap:2rem;flex-wrap:wrap;">
                        <span><b>Bodega:</b> <span id="np-fi-warehouse"></span></span>
                        <span><b>Pasillo:</b> <span id="np-fi-aisle" style="font-weight:900;font-size:1rem;color:var(--accent-cyan,#2E4A6E);"></span></span>
                        <span><b>Estante:</b> <span id="np-fi-shelf"></span></span>
                        <span><b>Nivel:</b> <span id="np-fi-level"></span></span>
                        <span><b>Lote:</b> <span id="np-fi-lot" style="font-family:monospace;"></span></span>
                        <span><b>Vence:</b> <span id="np-fi-exp"></span></span>
                        <span><b>Stock:</b> <span id="np-fi-stock"></span> uds</span>
                        <span><b>Precio:</b> <span id="np-fi-price"></span></span>
                    </div>
                </div>
            </div>

            <!-- Tabla de ítems del draft -->
            <div id="np-items-wrap">
                ${_renderNewPickTable()}
            </div>

            <!-- Botón crear lista -->
            <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
                <button class="btn btn-secondary btn-sm" onclick="_newPickItems=[];renderPickingNew();">Limpiar</button>
                <button class="btn btn-primary" onclick="createManualPickingList()" ${_newPickItems.length === 0 ? 'disabled' : ''}>
                    ${pickIcon('check')} Crear lista de preparación
                </button>
            </div>
        </div>

        <!-- ═══ PEDIDOS SIN LISTA (desde facturas existentes) ═══ -->
        <div class="card" style="margin-bottom:1.5rem;">
            <div class="card-header">
                <h2 class="card-title">${pickIcon('box')} Pedidos listos para preparar (desde facturas)</h2>
                <span class="badge badge-info">${pending.length} sin lista</span>
            </div>
            <p class="pick-help">Facturas registradas que aún no tienen su lista de preparación.</p>
            <div class="table-responsive">
                <table class="custom-table">
                    <thead><tr>
                        <th>Pedido</th><th>Cliente</th><th>Fecha</th>
                        <th style="text-align:center;">Productos</th><th style="text-align:right;">Acción</th>
                    </tr></thead>
                    <tbody>
                        ${pending.length === 0
            ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem 0;">Todos los pedidos ya tienen lista de preparación. ✅</td></tr>`
            : pending.map(inv => `
                                <tr>
                                    <td style="font-family:'JetBrains Mono';font-weight:600;">${inv.id}</td>
                                    <td>${escapeHtml(inv.clientName)}</td>
                                    <td>${inv.date}</td>
                                    <td style="text-align:center;">${inv.items.length}</td>
                                    <td style="text-align:right;">
                                        <button class="btn btn-primary btn-sm" onclick="generatePickingFromOrder('${inv.id}')">Generar lista</button>
                                    </td>
                                </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>

    `;
}

function _renderNewPickTable() {
    if (_newPickItems.length === 0) {
        return `<div style="text-align:center;color:var(--text-muted);padding:1.5rem 0;font-size:0.85rem;">
            Aún no hay productos en la lista. Ingresa un SKU y haz clic en "+ Agregar".
        </div>`;
    }
    const rows = _newPickItems.map((it, i) => `
        <tr>
            <td style="font-family:monospace;font-size:0.82rem;">${it.sku}</td>
            <td>${escapeHtml(it.name)}</td>
            <td style="text-align:center;font-weight:700;color:var(--accent-cyan,#2E4A6E);">${it.aisle}</td>
            <td style="text-align:center;">${it.shelf}</td>
            <td style="font-family:monospace;font-size:0.8rem;">${it.lot || '—'}</td>
            <td style="font-size:0.8rem;">${it.expDate || '—'}</td>
            <td style="text-align:center;font-weight:700;">${it.requestedQty}</td>
            <td style="text-align:right;">${formatCurrency(it.price * it.requestedQty)}</td>
            <td style="text-align:center;">
                <button class="btn btn-danger btn-sm" onclick="_removeNewPickItem(${i})">✕</button>
            </td>
        </tr>`).join('');
    const total = _newPickItems.reduce((s, it) => s + it.price * it.requestedQty, 0);
    return `
        <table class="custom-table" style="font-size:0.85rem;">
            <thead><tr>
                <th>SKU</th><th>Producto</th><th style="text-align:center;">Pasillo</th>
                <th style="text-align:center;">Estante</th><th>Lote</th><th>Vencimiento</th>
                <th style="text-align:center;">Cant.</th><th style="text-align:right;">Subtotal</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
                <td colspan="7" style="text-align:right;font-weight:600;padding:.6rem .75rem;">TOTAL ESTIMADO →</td>
                <td style="text-align:right;font-weight:700;color:var(--accent-emerald,#5E7D52);padding:.6rem .75rem;">${formatCurrency(total)}</td>
                <td></td>
            </tr></tfoot>
        </table>`;
}

function pickSKULookup(rawVal) {
    const sku = rawVal.trim().toUpperCase();
    const product = state.products.find(p => (p.sku || '').toUpperCase() === sku);
    const card = document.getElementById('np-product-card');
    const nameInput = document.getElementById('np-found-name');
    const addBtn = document.getElementById('np-add-btn');
    if (!card || !nameInput) return;
    if (!product) {
        nameInput.value = sku.length > 2 ? 'Producto no encontrado' : '';
        nameInput.style.color = sku.length > 2 ? 'var(--accent-rose,#A8442C)' : 'var(--text-muted)';
        card.style.display = 'none';
        addBtn.disabled = true;
        return;
    }
    nameInput.value = product.name;
    nameInput.style.color = 'var(--accent-emerald,#5E7D52)';
    document.getElementById('np-fi-warehouse').textContent = product.warehouse || '—';
    document.getElementById('np-fi-aisle').textContent = product.aisle || '—';
    document.getElementById('np-fi-shelf').textContent = product.shelf || '—';
    document.getElementById('np-fi-level').textContent = product.level || '—';
    document.getElementById('np-fi-lot').textContent = product.lot || '—';
    document.getElementById('np-fi-exp').textContent = product.expDate || '—';
    document.getElementById('np-fi-stock').textContent = product.stock;
    document.getElementById('np-fi-price').textContent = formatCurrency(product.price);
    card.style.display = 'flex';
    const qtyInput = document.getElementById('np-qty');
    if (qtyInput) { qtyInput.max = product.stock; }
    addBtn.disabled = false;
}

function addItemToNewPick() {
    const skuRaw = (document.getElementById('np-sku')?.value || '').trim().toUpperCase();
    const qty = parseInt(document.getElementById('np-qty')?.value) || 1;
    const product = state.products.find(p => (p.sku || '').toUpperCase() === skuRaw);
    if (!product) { triggerToast('error', 'SKU no encontrado en catálogo.'); return; }
    if (qty < 1) { triggerToast('error', 'Cantidad debe ser mayor a cero.'); return; }
    if (qty > product.stock) { triggerToast('error', `Stock insuficiente. Máximo: ${product.stock} uds.`); return; }
    const existing = _newPickItems.findIndex(it => it.productId === product.id);
    if (existing !== -1) {
        _newPickItems[existing].requestedQty += qty;
    } else {
        _newPickItems.push(buildPickItem(product, qty));
    }
    // Clear SKU field and reset card
    const skuEl = document.getElementById('np-sku');
    const nameEl = document.getElementById('np-found-name');
    const card = document.getElementById('np-product-card');
    if (skuEl) skuEl.value = '';
    if (nameEl) { nameEl.value = ''; nameEl.style.color = ''; }
    if (card) card.style.display = 'none';
    document.getElementById('np-add-btn').disabled = true;
    document.getElementById('np-qty').value = 1;
    // Re-render items table
    document.getElementById('np-items-wrap').innerHTML = _renderNewPickTable();
    triggerToast('success', `${escapeHtml(product.name)} agregado (${qty} uds).`);
}

function _removeNewPickItem(idx) {
    _newPickItems.splice(idx, 1);
    document.getElementById('np-items-wrap').innerHTML = _renderNewPickTable();
}

function createManualPickingList() {
    if (_newPickItems.length === 0) { triggerToast('error', 'Agrega al menos un producto.'); return; }
    const clientName = document.getElementById('np-client')?.value?.trim() || 'Sin nombre';
    const clientId = document.getElementById('np-client-id')?.value?.trim() || '';
    const operator = document.getElementById('np-operator')?.value?.trim() || 'Sin asignar';
    const priority = document.getElementById('np-priority')?.value || 'media';
    const ordered = sortByRoute([..._newPickItems]);
    const list = {
        id: nextPickingId(),
        orderRef: `MANUAL-${Date.now()}`,
        type: 'Manual',
        clientName,
        clientId,
        date: new Date().toISOString().split('T')[0],
        createdAt: Date.now(),
        status: 'pendiente',
        operator,
        priority,
        estimatedSec: estimatePickingTime(ordered),
        startedAt: null,
        finishedAt: null,
        items: ordered,
        history: [{ ts: Date.now(), action: 'Creada', detail: 'Lista creada manualmente', by: operator }]
    };
    state.pickingLists.push(list);
    savePickingToStorage();
    _newPickItems = [];
    triggerToast('success', `Lista ${list.id} creada para ${escapeHtml(clientName)}.`);
    state.activePickingSub = 'proceso';
    renderPicking();
}

function sendPickingToInvoice(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;

    // Build invoice items from the picking list
    const invoiceItems = list.items
        .filter(it => it.productId && (it.requestedQty || 0) > 0)
        .map(it => {
            const product = state.products.find(p => p.id === it.productId);
            return {
                productId: it.productId,
                name: it.name,
                price: product ? product.price : (it.price || 0),
                qty: it.requestedQty
            };
        });

    if (invoiceItems.length === 0) {
        triggerToast('error', 'La lista no tiene productos válidos para facturar.');
        return;
    }

    // Pre-load the invoice builder
    state.invoiceItems = invoiceItems;
    state._pickingSourceId = id;

    // Navigate to invoicing tab (initializeInvoiceBuilder resets items so we set after)
    closePickingModal();
    switchTab('invoicing');

    // Populate client info and product fields
    const clientEl = document.getElementById('invoice-client-name');
    const clientIdEl = document.getElementById('invoice-client-id');
    if (clientEl) clientEl.value = list.clientName || '';
    if (clientIdEl) clientIdEl.value = list.clientId || '';

    populateProductSelector();
    renderInvoiceBuilderItems();
    calculateInvoiceTotals();

    triggerToast('success', `Lista ${list.id} cargada en facturación — ${invoiceItems.length} productos.`);
}

function generatePickingFromOrder(invoiceId) {
    const inv = state.invoices.find(i => i.id === invoiceId);
    if (!inv) { triggerToast('error', 'No se encontró el pedido.'); return; }
    if (state.pickingLists.some(l => l.orderRef === invoiceId)) {
        triggerToast('error', 'Este pedido ya tiene una lista de preparación.');
        return;
    }
    generatePickingFromInvoice(inv);
    state.activePickingSub = 'proceso';
    renderPicking();
}

// --- Tarjeta resumen de una lista ---
function pickingListCard(list) {
    const p = listProgress(list);
    const st = PICKING_STATUS[list.status];
    const pr = PICKING_PRIORITY[list.priority] || PICKING_PRIORITY.media;
    return `
        <div class="pick-list-card status-${list.status}" onclick="openPickingDetail('${list.id}')" style="border-left: 3px solid ${pr.color};">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <span style="display:inline-flex;align-items:center;gap:4px;background:${pr.color}22;color:${pr.color};border:1px solid ${pr.color}44;border-radius:20px;padding:0.15rem 0.6rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
                    ${list.priority === 'alta' ? '🔴' : list.priority === 'baja' ? '🟢' : '🔵'} ${pr.label}
                </span>
                <span class="badge ${st.badge}" style="font-size:0.68rem;">${st.label}</span>
            </div>
            <div class="pick-list-card-top">
                <div>
                    <div class="pick-list-id">${list.id}</div>
                    <div class="pick-list-client">${escapeHtml(list.clientName)}</div>
                </div>
            </div>
            <div class="pick-list-meta">
                <span class="pick-list-op">${pickIcon('box')} ${list.operator}</span>
            </div>
            <div class="pick-progress-track"><div class="pick-progress-fill status-fill-${list.status}" style="width:${p.pct}%;"></div></div>
            <div class="pick-list-foot">
                <span>${p.itemsDone}/${p.itemsTotal} productos</span>
                <span class="pick-list-pct">${p.pct}%</span>
            </div>
        </div>`;
}

// ==========================================================================
//   FILTROS
// ==========================================================================
const pickingFilters = { estado: 'all', operario: 'all', cliente: '', prioridad: 'all', zona: 'all' };

function applyPickingFilters() {
    pickingFilters.estado = document.getElementById('pf-estado')?.value || 'all';
    pickingFilters.operario = document.getElementById('pf-operario')?.value || 'all';
    pickingFilters.cliente = document.getElementById('pf-cliente')?.value || '';
    pickingFilters.prioridad = document.getElementById('pf-prioridad')?.value || 'all';
    pickingFilters.zona = document.getElementById('pf-zona')?.value || 'all';
    renderPicking();
}

function getFilteredLists(statuses) {
    return state.pickingLists.filter(l => {
        if (statuses && !statuses.includes(l.status)) return false;
        if (pickingFilters.estado !== 'all' && l.status !== pickingFilters.estado) return false;
        if (pickingFilters.operario !== 'all' && l.operator !== pickingFilters.operario) return false;
        if (pickingFilters.prioridad !== 'all' && l.priority !== pickingFilters.prioridad) return false;
        if (pickingFilters.cliente) {
            const q = pickingFilters.cliente.toLowerCase();
            const matchClient = l.clientName.toLowerCase().includes(q);
            const matchId = l.id.toLowerCase().includes(q);
            const matchProduct = l.items.some(it => it.name.toLowerCase().includes(q));
            if (!matchClient && !matchId && !matchProduct) return false;
        }
        if (pickingFilters.zona !== 'all' && !l.items.some(it => it.aisle === pickingFilters.zona)) return false;
        return true;
    });
}

function pickingFilterBar(scopeStatuses) {
    const operators = [...new Set(state.pickingLists.map(l => l.operator))];
    return `
        <div class="card pick-filter-bar">
            <div class="pick-filter-group">
                <input type="text" class="form-input" id="pf-cliente" placeholder="Buscar cliente, pedido o producto..." value="${pickingFilters.cliente}" oninput="applyPickingFilters()">
            </div>
            <select class="form-select" id="pf-estado" onchange="applyPickingFilters()">
                <option value="all">Todos los estados</option>
                ${(scopeStatuses || Object.keys(PICKING_STATUS)).map(s => `<option value="${s}" ${pickingFilters.estado === s ? 'selected' : ''}>${PICKING_STATUS[s].label}</option>`).join('')}
            </select>
            <select class="form-select" id="pf-operario" onchange="applyPickingFilters()">
                <option value="all">Todos los operarios</option>
                ${operators.map(o => `<option value="${o}" ${pickingFilters.operario === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
            <select class="form-select" id="pf-prioridad" onchange="applyPickingFilters()">
                <option value="all">Toda prioridad</option>
                ${Object.entries(PICKING_PRIORITY).map(([k, v]) => `<option value="${k}" ${pickingFilters.prioridad === k ? 'selected' : ''}>${v.label}</option>`).join('')}
            </select>
            <select class="form-select" id="pf-zona" onchange="applyPickingFilters()">
                <option value="all">Toda la bodega</option>
                ${['A', 'B', 'C', 'D'].map(z => `<option value="${z}" ${pickingFilters.zona === z ? 'selected' : ''}>Pasillo ${z}</option>`).join('')}
            </select>
        </div>`;
}

// ==========================================================================
//   SUB-VISTA: EN PREPARACIÓN
// ==========================================================================
function renderPickingActive() {
    const c = document.getElementById('picking-content');
    const lists = getFilteredLists(['pendiente', 'en_proceso', 'parcial']);
    c.innerHTML = `
        ${pickingFilterBar(['pendiente', 'en_proceso', 'parcial'])}
        <div class="pick-card-grid">
            ${lists.length === 0 ? `<div class="card">${emptyMini('No hay pedidos en preparación con estos filtros.')}</div>` :
            lists.map(l => pickingListCard(l)).join('')}
        </div>`;
}

// ==========================================================================
//   SUB-VISTA: PREPARADOS / COMPLETADOS
// ==========================================================================
function renderPickingCompleted() {
    const c = document.getElementById('picking-content');
    const lists = getFilteredLists(['completado', 'despachado']);
    c.innerHTML = `
        ${pickingFilterBar(['completado', 'despachado'])}
        <div class="card">
            <div class="card-header"><h2 class="card-title">${pickIcon('truck')} Pedidos preparados y despachados</h2>
                <span class="badge badge-success">${lists.length}</span></div>
            <div class="table-responsive">
                <table class="custom-table">
                    <thead><tr><th>Pedido</th><th>Cliente</th><th>Operario</th><th style="text-align:center;">Productos</th><th style="text-align:right;">Tiempo real</th><th>Estado</th><th style="text-align:right;">Acción</th></tr></thead>
                    <tbody>
                        ${lists.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">No hay pedidos preparados con estos filtros.</td></tr>` :
            lists.map(l => {
                const p = listProgress(l); const st = PICKING_STATUS[l.status];
                return `<tr>
                                <td style="font-family:'JetBrains Mono';font-weight:600;">${l.id}</td>
                                <td>${escapeHtml(l.clientName)}</td>
                                <td>${l.operator}</td>
                                <td style="text-align:center;">${p.itemsDone}/${p.itemsTotal}</td>
                                <td style="text-align:right;font-family:'JetBrains Mono';">${formatDuration(elapsedSeconds(l))}</td>
                                <td><span class="badge ${st.badge}">${st.label}</span></td>
                                <td style="text-align:right;">
                                    <button class="btn btn-secondary btn-sm" onclick="openPickingDetail('${l.id}')">Ver</button>
                                    ${l.status === 'completado' ? `<button class="btn btn-primary btn-sm" onclick="dispatchPicking('${l.id}')">Despachar</button>` : ''}
                                </td>
                            </tr>`;
            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

// ==========================================================================
//   SUB-VISTA: STOCK COMPROMETIDO
// ==========================================================================
let _committedQuery = '';

function renderCommittedStock() {
    const c = document.getElementById('picking-content');
    let rows = state.products.map(p => {
        const committed = getCommittedStock(p.id);
        const available = Math.max(0, Number(p.stock) - committed);
        return { p, phys: Number(p.stock), committed, available, loc: buildLocationCode(p) };
    }).filter(r => r.committed > 0 || r.phys > 0);

    rows.sort((a, b) => b.committed - a.committed);

    const q = _committedQuery.toLowerCase().trim();
    if (q) {
        rows = rows.filter(r =>
            r.p.name.toLowerCase().includes(q) ||
            (r.p.sku || '').toLowerCase().includes(q) ||
            r.loc.toLowerCase().includes(q) ||
            (r.p.aisle || '').toLowerCase().includes(q)
        );
    }

    c.innerHTML = `
        <div class="card">
            <div class="card-header"><h2 class="card-title">${pickIcon('box')} Unidades reservadas por pedidos en curso</h2></div>
            <p class="pick-help">El <strong>stock comprometido</strong> son unidades ya apartadas para pedidos que se están preparando. El <strong>disponible real</strong> es lo que aún puedes vender.</p>
            <div style="margin-bottom:1rem;">
                <input type="text" class="form-input" placeholder="Buscar por nombre, SKU o ubicación (ej: A-01, SKU-BOSC-1500)..."
                    value="${_committedQuery}"
                    oninput="_committedQuery=this.value;renderCommittedStock();"
                    style="max-width:480px;">
            </div>
            <div class="table-responsive">
                <table class="custom-table">
                    <thead><tr><th>Producto</th><th>Ubicación</th><th style="text-align:right;">Stock físico</th><th style="text-align:right;">Comprometido</th><th style="text-align:right;">Disponible real</th><th style="min-width:140px;">Reserva</th></tr></thead>
                    <tbody>
                        ${rows.length === 0
            ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem 0;">Sin resultados para "${_committedQuery}".</td></tr>`
            : rows.map(r => {
                const pctCommitted = r.phys > 0 ? Math.min(100, (r.committed / r.phys) * 100) : (r.committed > 0 ? 100 : 0);
                return `<tr>
                                    <td>
                                        <div class="product-meta-info">
                                            <span class="product-name">${r.p.name}</span>
                                            <span class="product-sku">${r.p.sku}</span>
                                        </div>
                                    </td>
                                    <td>${r.loc ? `<span class="pick-loc-chip">${r.loc}</span>` : '<span class="badge badge-danger">Sin ubicación</span>'}</td>
                                    <td style="text-align:right;font-family:'JetBrains Mono';font-weight:600;">${r.phys}</td>
                                    <td style="text-align:right;font-family:'JetBrains Mono';font-weight:700;color:var(--accent-gold);">${r.committed}</td>
                                    <td style="text-align:right;font-family:'JetBrains Mono';font-weight:700;color:${r.available === 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">${r.available}</td>
                                    <td>
                                        <div class="pick-progress-track" style="height:8px;"><div class="pick-progress-fill" style="width:${pctCommitted}%;background:var(--accent-gold-gradient);"></div></div>
                                    </td>
                                </tr>`;
            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

// ==========================================================================
//   SUB-VISTA: PRODUCTOS PENDIENTES (lo que falta por recoger)
// ==========================================================================
function renderPendingProducts() {
    const c = document.getElementById('picking-content');
    const pending = [];
    state.pickingLists.filter(l => ['pendiente', 'en_proceso', 'parcial'].includes(l.status)).forEach(l => {
        l.items.forEach(it => {
            const remaining = (it.requestedQty || 0) - (it.pickedQty || 0);
            if (remaining > 0) {
                const prod = state.products.find(p => p.id === it.productId);
                const phys = prod ? Number(prod.stock) : 0;
                let reason = 'Por recoger', reasonClass = 'badge-info';
                if (!it.aisle) { reason = 'Sin ubicación'; reasonClass = 'badge-danger'; }
                else if (phys < remaining) { reason = `Faltan ${remaining - phys} en bodega`; reasonClass = 'badge-danger'; }
                else if (daysToExpiry(it.expDate) !== null && daysToExpiry(it.expDate) <= 30) { reason = 'Por vencer'; reasonClass = 'badge-warning'; }
                pending.push({ list: l, it, remaining, reason, reasonClass });
            }
        });
    });

    // Ordenar por recorrido óptimo
    pending.sort((a, b) => {
        const az = AISLE_ORDER[a.it.aisle] || 9, bz = AISLE_ORDER[b.it.aisle] || 9;
        if (az !== bz) return az - bz;
        return (a.it.shelf || 0) - (b.it.shelf || 0);
    });

    c.innerHTML = `
        <div class="card">
            <div class="card-header"><h2 class="card-title">${pickIcon('alert')} Productos que faltan por recoger</h2>
                <span class="badge badge-warning">${pending.length}</span></div>
            <p class="pick-help">Lista ordenada por <strong>recorrido de bodega</strong> (del pasillo más cercano al más lejano) para que el operario camine lo mínimo.</p>
            <div class="table-responsive">
                <table class="custom-table">
                    <thead><tr><th>Producto</th><th>Ubicación</th><th>Pedido</th><th style="text-align:center;">Faltan</th><th>Lote</th><th>Estado</th></tr></thead>
                    <tbody>
                        ${pending.length === 0 ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">¡No hay productos pendientes! Todo está recogido. 🎉</td></tr>` :
            pending.map(x => `
                            <tr>
                                <td><span class="product-name">${x.it.name}</span></td>
                                <td>${x.it.location ? `<span class="pick-loc-chip">${x.it.location}</span> <span class="pick-zone-tag">${zoneLabel(x.it.aisle)}</span>` : '<span class="badge badge-danger">Sin ubicación</span>'}</td>
                                <td style="font-family:'JetBrains Mono';font-size:0.8rem;cursor:pointer;color:var(--accent-cyan);" onclick="openPickingDetail('${x.list.id}')">${x.list.id}</td>
                                <td style="text-align:center;font-weight:700;">${x.remaining}</td>
                                <td style="font-family:'JetBrains Mono';font-size:0.8rem;">${x.it.lot || '—'}</td>
                                <td><span class="badge ${x.reasonClass}">${x.reason}</span></td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

// ==========================================================================
//   SUB-VISTA: HISTORIAL / AUDITORÍA
// ==========================================================================
function renderPickingHistory() {
    const c = document.getElementById('picking-content');
    const events = [];
    state.pickingLists.forEach(l => {
        (l.history || []).forEach(h => events.push({ ...h, listId: l.id, client: l.clientName }));
    });
    events.sort((a, b) => b.ts - a.ts);

    c.innerHTML = `
        <div class="card">
            <div class="card-header"><h2 class="card-title">${pickIcon('clock')} Historial de movimientos y cambios</h2>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-secondary btn-sm" onclick="exportAllPickingCSV()">${pickIcon('download')} Excel</button>
                  <button class="btn btn-primary btn-sm" onclick="exportAllPickingPDF()">${pickIcon('printer')} PDF</button>
                </div></div>
            <div class="pick-timeline">
                ${events.length === 0 ? emptyMini('Sin movimientos registrados.') :
            events.slice(0, 60).map(e => {
                const d = new Date(e.ts);
                const time = d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                return `<div class="pick-timeline-item">
                        <div class="pick-timeline-dot"></div>
                        <div class="pick-timeline-body">
                            <div class="pick-timeline-head">
                                <strong>${e.action}</strong>
                                <span class="pick-timeline-time">${time}</span>
                            </div>
                            <div class="pick-timeline-detail">${e.detail} · <span style="color:var(--accent-cyan);">${e.listId}</span> · ${e.client} · ${e.by}</div>
                        </div>
                    </div>`;
            }).join('')}
            </div>
        </div>`;
}

// ==========================================================================
//   MODAL DE PREPARACIÓN INTERACTIVA
// ==========================================================================
let pickingTimerInterval = null;

function openPickingDetail(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    state.activePickingId = id;
    document.getElementById('picking-modal').classList.add('active');
    renderPickingDetailBody();

    // Cronómetro en vivo si está en preparación
    clearInterval(pickingTimerInterval);
    if (list.status === 'en_proceso') {
        pickingTimerInterval = setInterval(() => {
            const el = document.getElementById('pick-live-timer');
            if (el) el.innerText = formatDuration(elapsedSeconds(list));
            else clearInterval(pickingTimerInterval);
        }, 1000);
    }
}

function closePickingModal() {
    document.getElementById('picking-modal').classList.remove('active');
    clearInterval(pickingTimerInterval);
    state.activePickingId = null;
    renderPicking();
}

function renderPickingDetailBody() {
    const list = state.pickingLists.find(l => l.id === state.activePickingId);
    if (!list) return;
    const body = document.getElementById('picking-modal-body');
    const p = listProgress(list);
    const st = PICKING_STATUS[list.status];
    const isActive = ['pendiente', 'en_proceso', 'parcial'].includes(list.status);
    const operators = ['Sin asignar', 'Administrador Master', 'Jefe de Depósito', 'Operador de Caja'];
    if (PICKING_SESSION && !operators.includes(PICKING_SESSION.name)) operators.push(PICKING_SESSION.name);

    const ordered = sortByRoute(list.items);

    body.innerHTML = `
        <div class="pick-detail-head">
            <div>
                <div class="pick-detail-id">${list.id} <span class="badge ${st.badge}">${st.label}</span></div>
                <div class="pick-detail-client">${escapeHtml(list.clientName)} · ${escapeHtml(list.clientId || '')}</div>
                <div class="pick-detail-sub">Pedido origen: ${list.orderRef} · ${list.date}</div>
            </div>
            <div class="pick-ring" style="--pct:${p.pct};">
                <div class="pick-ring-inner">${p.pct}%</div>
            </div>
        </div>

        <div class="pick-detail-controls">
            <div class="pick-ctrl">
                <label class="form-label">Operario asignado</label>
                <select class="form-select" ${isActive ? '' : 'disabled'} onchange="assignOperator('${list.id}', this.value)">
                    ${operators.map(o => `<option value="${o}" ${list.operator === o ? 'selected' : ''}>${o}</option>`).join('')}
                </select>
            </div>
            <div class="pick-ctrl">
                <label class="form-label">Prioridad</label>
                <select class="form-select" ${isActive ? '' : 'disabled'} onchange="setPriority('${list.id}', this.value)">
                    ${Object.entries(PICKING_PRIORITY).map(([k, v]) => `<option value="${k}" ${list.priority === k ? 'selected' : ''}>${v.label}</option>`).join('')}
                </select>
            </div>
        </div>

        <div class="pick-stat-row">
            <div class="pick-stat-box"><span class="pick-stat-num">${p.totalPicked}/${p.totalReq}</span><span class="pick-stat-lbl">Unidades recogidas</span></div>
            <div class="pick-stat-box"><span class="pick-stat-num">${p.remainingItems}</span><span class="pick-stat-lbl">Productos restantes</span></div>
            <div class="pick-stat-box"><span class="pick-stat-num">${formatDuration(list.estimatedSec)}</span><span class="pick-stat-lbl">Tiempo estimado</span></div>
            <div class="pick-stat-box"><span class="pick-stat-num" id="pick-live-timer">${formatDuration(elapsedSeconds(list))}</span><span class="pick-stat-lbl">Tiempo real</span></div>
        </div>

        ${isActive ? `
        <div class="pick-scan-box">
            <div class="pick-scan-input-wrap">
                ${pickIcon('box')}
                <input type="text" id="pick-scan-input" class="form-input" placeholder="Escanea o escribe el código / SKU del producto..."
                    onkeydown="if(event.key==='Enter'){validateScan('${list.id}', this.value); this.value='';}">
            </div>
            <button class="btn btn-secondary btn-sm" onclick="const i=document.getElementById('pick-scan-input'); validateScan('${list.id}', i.value); i.value='';">Validar</button>
            <button class="btn btn-secondary btn-sm" onclick="voicePickNext('${list.id}')" title="Leer en voz alta el siguiente producto">🔊 Voz</button>
        </div>` : ''}

        <div class="pick-items-list">
            ${ordered.map((it, idx) => pickItemRow(list, it, idx, isActive)).join('')}
        </div>

        <div class="pick-detail-actions">
            <button class="btn btn-secondary btn-sm" onclick="exportPickingCSV('${list.id}')">${pickIcon('download')} Excel</button>
            <button class="btn btn-secondary btn-sm" onclick="exportPickingPDF('${list.id}')">${pickIcon('printer')} PDF / Imprimir</button>
            <button class="btn btn-primary btn-sm" onclick="sendPickingToInvoice('${list.id}')" title="Cargar esta lista en el módulo de facturación">
                ${pickIcon('truck')} Enviar a Facturación
            </button>
            <div style="flex:1;"></div>
            ${list.status === 'pendiente' ? `<button class="btn btn-primary" onclick="startPicking('${list.id}')">${pickIcon('play')} Iniciar preparación</button>` : ''}
            ${(list.status === 'en_proceso') ? `<button class="btn btn-primary" onclick="completePicking('${list.id}')">${pickIcon('check')} Finalizar</button>` : ''}
            ${(list.status === 'completado' || list.status === 'parcial') ? `<button class="btn btn-primary" onclick="dispatchPicking('${list.id}')">${pickIcon('truck')} Despachar</button>` : ''}
            ${isActive ? `<button class="btn btn-danger btn-sm" onclick="cancelPicking('${list.id}')">Cancelar</button>` : ''}
        </div>
    `;
}

function pickItemRow(list, it, idx, isActive) {
    const done = (it.pickedQty || 0) >= (it.requestedQty || 0);
    const partial = (it.pickedQty || 0) > 0 && !done;
    const d = daysToExpiry(it.expDate);
    const expBadge = d !== null && d <= 30 ? `<span class="badge ${d < 0 ? 'badge-danger' : 'badge-warning'}" style="font-size:0.62rem;">${d < 0 ? 'Vencido' : 'Vence ' + d + 'd'}</span>` : '';
    const fefoBadge = `<span class="pick-fefo-tag" title="Lote elegido por vencer primero">FEFO</span>`;

    // #6 — Badge de stock crítico
    const prod = state.products.find(p => p.id === it.productId);
    const currentStock = prod ? Number(prod.stock) : 0;
    let stockBadge = '';
    if (currentStock === 0) {
        stockBadge = `<span class="badge badge-danger" style="font-size:0.62rem;">Sin stock</span>`;
    } else if (currentStock < it.requestedQty) {
        stockBadge = `<span class="badge badge-warning" style="font-size:0.62rem;">Stock: ${currentStock}/${it.requestedQty}</span>`;
    }

    // #5 — Botón de confirmación ítem a ítem
    const confirmBtn = isActive ? (done
        ? `<button class="pick-check checked" onclick="togglePickItem('${list.id}','${it.productId}')" title="Desmarcar">
               ${pickIcon('check')}
           </button>`
        : `<button class="pick-check" onclick="togglePickItem('${list.id}','${it.productId}')" title="Confirmar recogida completa" style="display:flex;flex-direction:column;align-items:center;gap:2px;font-size:0.6rem;color:var(--text-muted);padding:0.3rem;">
               <span class="pick-route-num">${idx + 1}</span>
               <span style="font-size:0.55rem;letter-spacing:0.3px;">CONFIRMAR</span>
           </button>`)
        : `<button class="pick-check ${done ? 'checked' : ''}" disabled>${done ? pickIcon('check') : `<span class="pick-route-num">${idx + 1}</span>`}</button>`;

    return `
        <div class="pick-item-row ${done ? 'item-done' : partial ? 'item-partial' : ''}">
            ${confirmBtn}
            <div class="pick-item-info">
                <div class="pick-item-name">${escapeHtml(it.name)}</div>
                <div class="pick-item-meta">
                    ${it.location ? `<span class="pick-loc-chip">${it.location}</span>` : '<span class="badge badge-danger" style="font-size:0.62rem;">Sin ubicación</span>'}
                    <span class="pick-zone-tag">${zoneLabel(it.aisle)}</span>
                    <span class="pick-lot-tag">${fefoBadge} Lote ${it.lot || '—'}</span>
                    ${expBadge}
                    ${stockBadge}
                </div>
            </div>
            <div class="pick-item-qty">
                ${isActive ? `<input type="number" class="qty-input" min="0" max="${it.requestedQty}" value="${it.pickedQty || 0}" onchange="setPickItemQty('${list.id}','${it.productId}',this.value)">` : `<strong>${it.pickedQty || 0}</strong>`}
                <span class="pick-qty-of">/ ${it.requestedQty}</span>
            </div>
        </div>`;
}

// --- Acciones del operario ---
function logPicking(list, action, detail) {
    if (!list.history) list.history = [];
    const by = (PICKING_SESSION && PICKING_SESSION.name) || list.operator || 'Sistema';
    list.history.push({ ts: Date.now(), action, detail, by });
}

function recomputeStatus(list) {
    const p = listProgress(list);
    if (['despachado', 'cancelado'].includes(list.status)) return;
    if (p.totalPicked === 0) {
        list.status = list.startedAt ? 'en_proceso' : 'pendiente';
    } else if (p.totalPicked >= p.totalReq) {
        list.status = 'en_proceso'; // se marca "completado" al finalizar explícitamente
    } else {
        list.status = 'en_proceso';
    }
}

function startPicking(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    if (list.operator === 'Sin asignar' && PICKING_SESSION) {
        list.operator = PICKING_SESSION.name;
    }
    list.status = 'en_proceso';
    list.startedAt = Date.now();
    list.finishedAt = null;
    logPicking(list, 'Iniciada', 'Comenzó la preparación del pedido');
    savePickingToStorage();
    triggerToast('success', `Preparación de ${id} iniciada.`);
    openPickingDetail(id);
}

function togglePickItem(listId, productId) {
    const list = state.pickingLists.find(l => l.id === listId);
    if (!list) return;
    if (!list.startedAt) { list.status = 'en_proceso'; list.startedAt = Date.now(); logPicking(list, 'Iniciada', 'Comenzó la preparación'); }
    const it = list.items.find(i => i.productId === productId);
    if (!it) return;
    const done = (it.pickedQty || 0) >= it.requestedQty;
    it.pickedQty = done ? 0 : it.requestedQty;
    it.picked = !done;
    it.status = it.picked ? 'recogido' : 'pendiente';
    logPicking(list, it.picked ? 'Recogido' : 'Desmarcado', `${it.name} (${it.pickedQty}/${it.requestedQty})`);
    recomputeStatus(list);
    savePickingToStorage();
    renderPickingDetailBody();
}

function setPickItemQty(listId, productId, val) {
    const list = state.pickingLists.find(l => l.id === listId);
    if (!list) return;
    const it = list.items.find(i => i.productId === productId);
    if (!it) return;
    let q = parseInt(val);
    if (isNaN(q) || q < 0) q = 0;
    if (q > it.requestedQty) { q = it.requestedQty; triggerToast('error', `No puedes recoger más de lo pedido (${it.requestedQty}).`); }
    if (!list.startedAt && q > 0) { list.status = 'en_proceso'; list.startedAt = Date.now(); logPicking(list, 'Iniciada', 'Comenzó la preparación'); }
    it.pickedQty = q;
    it.picked = q >= it.requestedQty;
    it.status = it.picked ? 'recogido' : (q > 0 ? 'parcial' : 'pendiente');
    recomputeStatus(list);
    savePickingToStorage();
    renderPickingDetailBody();
}

function completePicking(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    const p = listProgress(list);
    list.finishedAt = Date.now();
    if (p.totalPicked >= p.totalReq) {
        list.status = 'completado';
        logPicking(list, 'Completada', 'Todos los productos recogidos');
        triggerToast('success', `${id} listo para despacho.`);
    } else {
        list.status = 'parcial';
        logPicking(list, 'Incompleta', `Faltaron ${p.remainingUnits} unidades`);
        triggerToast('error', `${id} quedó incompleto (faltan ${p.remainingUnits} uds).`);
    }
    clearInterval(pickingTimerInterval);
    savePickingToStorage();
    renderPickingDetailBody();
}

function dispatchPicking(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    if (!['completado', 'parcial'].includes(list.status)) {
        triggerToast('error', 'Primero finaliza la preparación del pedido.');
        return;
    }
    list.status = 'despachado';
    if (!list.finishedAt) list.finishedAt = Date.now();
    logPicking(list, 'Despachado', 'Pedido entregado a transporte');
    savePickingToStorage();
    triggerToast('success', `Pedido ${id} despachado correctamente.`);
    if (document.getElementById('picking-modal').classList.contains('active')) renderPickingDetailBody();
    renderPicking();
}

function cancelPicking(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    if (!confirm(`¿Cancelar la preparación del pedido ${id}? Las unidades dejarán de estar reservadas.`)) return;
    list.status = 'cancelado';
    logPicking(list, 'Cancelada', 'Preparación cancelada por el operario');
    clearInterval(pickingTimerInterval);
    savePickingToStorage();
    triggerToast('error', `Pedido ${id} cancelado.`);
    renderPickingDetailBody();
    renderPicking();
}

function assignOperator(id, name) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    list.operator = name;
    logPicking(list, 'Operario', `Asignado a ${name}`);
    savePickingToStorage();
    triggerToast('success', `Operario asignado: ${escapeHtml(name)}.`);
}

function setPriority(id, level) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    list.priority = level;
    logPicking(list, 'Prioridad', `Cambiada a ${PICKING_PRIORITY[level].label}`);
    savePickingToStorage();
}

// --- ESCANEO Y VALIDACIÓN ---
function validateScan(listId, code) {
    code = (code || '').trim();
    if (!code) return;
    const list = state.pickingLists.find(l => l.id === listId);
    if (!list) return;
    const lower = code.toLowerCase();
    const it = list.items.find(i =>
        (i.sku && i.sku.toLowerCase() === lower) ||
        (i.lot && i.lot.toLowerCase() === lower) ||
        (i.name && i.name.toLowerCase().includes(lower))
    );
    if (!it) {
        triggerToast('error', `El código "${code}" no pertenece a este pedido.`);
        return;
    }
    if ((it.pickedQty || 0) >= it.requestedQty) {
        triggerToast('error', `${escapeHtml(it.name.split(' ').slice(0, 2).join(' '))} ya está completo.`);
        return;
    }
    if (!list.startedAt) { list.status = 'en_proceso'; list.startedAt = Date.now(); logPicking(list, 'Iniciada', 'Comenzó la preparación'); }
    it.pickedQty = (it.pickedQty || 0) + 1;
    it.picked = it.pickedQty >= it.requestedQty;
    it.status = it.picked ? 'recogido' : 'parcial';
    logPicking(list, 'Escaneado', `${it.name} (${it.pickedQty}/${it.requestedQty})`);
    recomputeStatus(list);
    savePickingToStorage();
    triggerToast('success', `✓ ${escapeHtml(it.name.split(' ').slice(0, 2).join(' '))} validado (${it.pickedQty}/${it.requestedQty}).`);
    renderPickingDetailBody();
}

// --- PICKING POR VOZ (lee el siguiente producto en voz alta) ---
function voicePickNext(listId) {
    const list = state.pickingLists.find(l => l.id === listId);
    if (!list) return;
    const next = sortByRoute(list.items).find(it => (it.pickedQty || 0) < it.requestedQty);
    if (!next) { triggerToast('notif', 'No quedan productos por recoger.'); return; }
    const remaining = next.requestedQty - (next.pickedQty || 0);
    const msg = `Recoge ${remaining} unidades de ${next.name.split('(')[0]}. Ubicación ${next.location ? next.location.split('').join(' ') : 'no asignada'}.`;
    if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(msg);
        u.lang = 'es-ES'; u.rate = 0.95;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    }
    triggerToast('notif', `🔊 ${msg}`);
}

// --- EXPORTACIÓN E IMPRESIÓN ---
function exportPickingCSV(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    const headers = ['Pedido', 'Cliente', 'Producto', 'SKU', 'Ubicación', 'Lote', 'Vencimiento', 'Solicitado', 'Recogido', 'Estado'];
    const rows = sortByRoute(list.items).map(it => [
        list.id, list.clientName, it.name, it.sku, it.location || '', it.lot || '', it.expDate || '',
        it.requestedQty, it.pickedQty || 0, (it.pickedQty || 0) >= it.requestedQty ? 'Recogido' : 'Pendiente'
    ]);
    const html = buildXLSTable(`Lista de Picking — ${list.id} (${list.clientName})`, headers, rows);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AUREO_Picking_${list.id}.xls`;
    a.click();
    triggerToast('success', `Lista ${list.id} exportada.`);
}

function exportAllPickingCSV() {
    if (state.pickingLists.length === 0) { triggerToast('error', 'No hay listas para exportar.'); return; }
    const headers = ['Pedido', 'Cliente', 'Operario', 'Estado', 'Prioridad', 'Productos', 'Recogidas', 'Solicitadas', 'Tiempo Real (s)'];
    const rows = state.pickingLists.map(l => {
        const p = listProgress(l);
        return [l.id, l.clientName, l.operator, PICKING_STATUS[l.status].label, PICKING_PRIORITY[l.priority].label, p.itemsTotal, p.totalPicked, p.totalReq, elapsedSeconds(l)];
    });
    const dateStr = new Date().toISOString().split('T')[0];
    const html = buildXLSTable(`Historial de Preparación — AUREO (${dateStr})`, headers, rows);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AUREO_Picking_Historial_${dateStr}.xls`;
    a.click();
    triggerToast('success', 'Historial de preparación exportado.');
}

function exportAllPickingPDF() {
    if (state.pickingLists.length === 0) { triggerToast('error', 'No hay listas para exportar.'); return; }
    const s = state.settings;
    const now = new Date();
    const printDate = now.toLocaleDateString('es-CO') + ' ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const initials = s.companyName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const rows = state.pickingLists.map(l => {
        const p = listProgress(l);
        const st = PICKING_STATUS[l.status];
        const pr = PICKING_PRIORITY[l.priority];
        const pct = p.totalReq > 0 ? Math.round((p.totalPicked / p.totalReq) * 100) : 0;
        const secs = elapsedSeconds(l);
        const mins = secs > 0 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : '—';
        const barW = pct;
        const barC = pct === 100 ? '#16a34a' : pct > 50 ? '#2563eb' : '#d97706';
        return `<tr>
            <td style="font-family:monospace;font-size:8.5pt;"><strong>${l.id}</strong></td>
            <td>${l.clientName}</td>
            <td>${l.operator || '—'}</td>
            <td>${l.date}</td>
            <td style="font-weight:bold;color:${l.status === 'completado' ? '#16a34a' : l.status === 'en_proceso' ? '#2563eb' : '#d97706'};">${st.label}</td>
            <td style="font-weight:bold;">${pr.label}</td>
            <td style="text-align:center;">${p.itemsTotal}</td>
            <td style="text-align:center;">${p.totalPicked} / ${p.totalReq}</td>
            <td style="min-width:90px;">
              <div style="background:#e5e7eb;border-radius:4px;height:10px;overflow:hidden;">
                <div style="width:${barW}%;background:${barC};height:100%;border-radius:4px;"></div>
              </div>
              <span style="font-size:7.5pt;color:#555;">${pct}%</span>
            </td>
            <td style="text-align:center;font-size:8.5pt;">${mins}</td>
        </tr>`;
    }).join('');

    const total = state.pickingLists.length;
    const done = state.pickingLists.filter(l => l.status === 'completado' || l.status === 'despachado').length;

    const w = window.open('', '_blank', 'width=900,height=1000');
    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Historial de Preparación — ${s.companyName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;background:#fff;padding:26px 32px;}
  .hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1a1a2e;padding-bottom:12px;margin-bottom:14px;}
  .logo-box{width:56px;height:56px;background:#1a1a2e;color:#4A7AB5;font-size:22px;font-weight:900;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .brand-info h1{font-size:18px;font-weight:900;color:#1a1a2e;}
  .brand-info p{font-size:9pt;color:#555;margin-top:2px;}
  .brand-info small{font-size:8pt;color:#999;}
  .doc-label{margin-left:auto;text-align:right;}
  .doc-label h2{font-size:13px;font-weight:900;color:#1a1a2e;text-transform:uppercase;letter-spacing:1px;}
  .doc-label small{font-size:8.5pt;color:#777;}
  .kpi{display:flex;gap:14px;margin-bottom:16px;}
  .kpi-box{flex:1;border:1.5px solid #1a1a2e;border-radius:6px;padding:10px 14px;text-align:center;}
  .kpi-box .val{font-size:22px;font-weight:900;color:#1a1a2e;}
  .kpi-box .lbl{font-size:8pt;color:#777;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;}
  .section-bar{font-size:8.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.7px;color:#fff;background:#1a1a2e;padding:5px 10px;margin-bottom:0;}
  table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:0;}
  thead th{background:#1a1a2e;color:#fff;padding:7px 6px;text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;}
  tbody tr:nth-child(even){background:#f8f8fc;}
  td{padding:6px 6px;border-bottom:1px solid #e8e8ee;vertical-align:middle;}
  .footer{margin-top:18px;font-size:7.5pt;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:8px;}
  @media print{body{padding:10px 16px;}@page{margin:12mm;size:A4 landscape;}}
</style>
</head>
<body>

<div class="hdr">
  <div class="logo-box">${initials}</div>
  <div class="brand-info">
    <h1>${s.companyName}</h1>
    <p>${s.companySlogan}</p>
    <small>${s.taxId}</small>
  </div>
  <div class="doc-label">
    <h2>Historial de Preparación de Bodega</h2>
    <small>Impreso: ${printDate}</small>
  </div>
</div>

<div class="kpi">
  <div class="kpi-box"><div class="val">${total}</div><div class="lbl">Total órdenes</div></div>
  <div class="kpi-box"><div class="val" style="color:#16a34a;">${done}</div><div class="lbl">Completadas</div></div>
  <div class="kpi-box"><div class="val" style="color:#2563eb;">${state.pickingLists.filter(l => l.status === 'en_proceso').length}</div><div class="lbl">En proceso</div></div>
  <div class="kpi-box"><div class="val" style="color:#d97706;">${state.pickingLists.filter(l => l.status === 'pendiente').length}</div><div class="lbl">Pendientes</div></div>
  <div class="kpi-box"><div class="val">${total > 0 ? Math.round((done / total) * 100) : 0}%</div><div class="lbl">Tasa completado</div></div>
</div>

<div class="section-bar">Detalle de Órdenes (${total} registros)</div>
<table>
  <thead>
    <tr>
      <th>N° Pedido</th><th>Cliente</th><th>Operario</th><th>Fecha</th>
      <th>Estado</th><th>Prioridad</th><th>Líneas</th><th>Uds. Recogidas</th><th>Avance</th><th>Tiempo</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="footer">
  Generado por AUREO · Sistema de Gestión de Ferretería · ${printDate} &nbsp;|&nbsp; Documento de uso interno — no válido como comprobante fiscal.
</div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
}

function printPickingList(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    const ordered = sortByRoute(list.items);
    const w = window.open('', '_blank', 'width=800,height=900');
    const rows = ordered.map((it, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(it.name)}</td>
            <td>${it.location || '—'}</td>
            <td>${it.lot || '—'}</td>
            <td style="text-align:center;">${it.requestedQty}</td>
            <td style="width:60px;border:1px solid #999;">&nbsp;</td>
        </tr>`).join('');
    w.document.write(`
        <html><head><title>Lista de Preparación ${list.id}</title>
        <style>
            body{font-family:Arial,sans-serif;padding:30px;color:#111;}
            h1{font-size:20px;margin:0 0 4px;} .sub{color:#555;font-size:13px;margin-bottom:18px;}
            table{width:100%;border-collapse:collapse;font-size:13px;} th,td{border:1px solid #ccc;padding:8px;text-align:left;}
            th{background:#f3f3f3;} .meta{display:flex;gap:24px;margin-bottom:16px;font-size:13px;}
        </style></head><body>
        <h1>Lista de Preparación de Pedido</h1>
        <div class="sub">${list.id} · Generada por AUREO</div>
        <div class="meta">
            <div><strong>Cliente:</strong> ${escapeHtml(list.clientName)}</div>
            <div><strong>Pedido:</strong> ${list.orderRef}</div>
            <div><strong>Fecha:</strong> ${list.date}</div>
            <div><strong>Operario:</strong> ${list.operator}</div>
        </div>
        <table><thead><tr><th>#</th><th>Producto</th><th>Ubicación</th><th>Lote</th><th>Cantidad</th><th>✓ Recogido</th></tr></thead>
        <tbody>${rows}</tbody></table>
        <p style="margin-top:30px;font-size:12px;color:#555;">Recorrido ordenado del pasillo más cercano al más lejano para minimizar desplazamientos.</p>
        </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
}

function exportPickingPDF(id) {
    const list = state.pickingLists.find(l => l.id === id);
    if (!list) return;
    const ordered = sortByRoute(list.items);
    const s = state.settings;
    const now = new Date();
    const printDate = now.toLocaleDateString('es-CO') + ' ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const initials = s.companyName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const priority = PICKING_PRIORITY[list.priority];
    const status = PICKING_STATUS[list.status];
    const prioBadgeColor = { urgente: '#fee2e2;color:#b91c1c', alta: '#fef3c7;color:#92400e', normal: '#dbeafe;color:#1e40af', baja: '#f3f4f6;color:#374151' };
    const pBadge = prioBadgeColor[list.priority] || prioBadgeColor.normal;
    const totalUnits = ordered.reduce((a, it) => a + (it.requestedQty || 0), 0);
    const nearExpiry = ordered.filter(it => it.expDate && new Date(it.expDate) < new Date(Date.now() + 30 * 86400000));

    const itemRows = ordered.map((it, i) => {
        const expWarn = it.expDate && new Date(it.expDate) < new Date(Date.now() + 30 * 86400000);
        const loc = it.location || `Pasillo ${it.aisle || '?'} - Est. ${it.shelf || '?'}`;
        return `<tr>
            <td style="text-align:center;color:#888;width:24px;">${i + 1}</td>
            <td><strong>${escapeHtml(it.name)}</strong></td>
            <td style="font-family:monospace;font-size:8.5pt;color:#555;">${it.sku || '—'}</td>
            <td style="text-align:center;font-weight:bold;color:#1a1a2e;">${it.warehouse || '—'}</td>
            <td style="text-align:center;font-size:15pt;font-weight:900;color:#1a1a2e;">${it.aisle || loc.split('-')[0]?.replace(/[^A-Z]/gi, '') || '?'}</td>
            <td style="text-align:center;font-weight:bold;">${it.shelf || '?'}</td>
            <td style="text-align:center;color:#666;">${it.level || '—'}</td>
            <td style="font-family:monospace;font-size:8.5pt;">${it.lot || '—'}</td>
            <td style="font-size:8.5pt;${expWarn ? 'color:#b91c1c;font-weight:bold;' : ''}">${it.expDate || '—'}${expWarn ? ' ⚠' : ''}</td>
            <td style="text-align:center;font-size:14pt;font-weight:900;">${it.requestedQty}</td>
            <td style="text-align:center;font-size:16pt;color:#bbb;width:36px;">□</td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank', 'width=960,height=1100');
    w.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden Bodega — ${list.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#111;background:#fff;padding:28px 34px;}

  /* ── ENCABEZADO ── */
  .hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1a1a2e;padding-bottom:14px;margin-bottom:14px;}
  .logo-box{width:62px;height:62px;background:#1a1a2e;color:#4A7AB5;font-size:24px;font-weight:900;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:1px;}
  .brand-info h1{font-size:19px;font-weight:900;color:#1a1a2e;letter-spacing:.8px;}
  .brand-info p{font-size:9.5pt;color:#555;margin-top:2px;}
  .brand-info small{font-size:8.5pt;color:#999;}
  .doc-label{margin-left:auto;text-align:right;}
  .doc-label h2{font-size:14px;font-weight:900;color:#1a1a2e;text-transform:uppercase;letter-spacing:1px;}
  .prio-badge{display:inline-block;margin-top:5px;padding:3px 12px;border-radius:20px;font-size:8.5pt;font-weight:bold;background:${pBadge.split(';')[0]};${pBadge.split(';')[1]};}

  /* ── GRILLA META ── */
  .meta{display:grid;grid-template-columns:1fr 1fr;border:1.5px solid #1a1a2e;border-radius:6px;overflow:hidden;margin-bottom:18px;}
  .meta-col{display:flex;flex-direction:column;}
  .meta-col:first-child{border-right:1.5px solid #1a1a2e;}
  .meta-row{display:flex;border-bottom:1px solid #e0e0e8;}
  .meta-row:last-child{border-bottom:none;}
  .mk{font-weight:700;font-size:8pt;color:#777;padding:6px 10px;background:#f7f7f9;min-width:108px;border-right:1px solid #e0e0e8;text-transform:uppercase;letter-spacing:.3px;}
  .mv{padding:6px 10px;font-size:9.5pt;}

  /* ── SECCIÓN ── */
  .section-bar{font-size:8.5pt;font-weight:bold;text-transform:uppercase;letter-spacing:.7px;color:#fff;background:#1a1a2e;padding:5px 10px;margin-bottom:0;}
  .route-note{font-size:8pt;color:#666;font-style:italic;padding:4px 10px 6px;background:#f7f7f9;border-left:4px solid #1a1a2e;margin-bottom:8px;}

  /* ── TABLA ── */
  table{width:100%;border-collapse:collapse;font-size:9pt;}
  thead th{background:#1a1a2e;color:#fff;padding:7px 6px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;}
  tbody tr:nth-child(even){background:#f8f8fc;}
  td{padding:6px 6px;border-bottom:1px solid #e8e8ee;vertical-align:middle;}
  tfoot td{font-weight:bold;background:#f0f0f5;border-top:2px solid #1a1a2e;padding:7px 6px;}

  /* ── FIRMAS ── */
  .sigs{display:flex;gap:28px;margin-top:28px;}
  .sig{flex:1;border-top:1.5px solid #444;padding-top:8px;text-align:center;font-size:8.5pt;color:#555;}
  .sig strong{display:block;font-size:9.5pt;color:#111;margin-bottom:2px;}

  /* ── FOOTER ── */
  .footer{margin-top:20px;font-size:7.5pt;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:8px;}

  @media print{
    body{padding:10px 16px;}
    @page{margin:12mm;size:A4 landscape;}
  }
</style>
</head>
<body>

<!-- ENCABEZADO FERRETERÍA -->
<div class="hdr">
  <div class="logo-box">${initials}</div>
  <div class="brand-info">
    <h1>${s.companyName}</h1>
    <p>${s.companySlogan}</p>
    <small>${s.taxId}</small>
  </div>
  <div class="doc-label">
    <h2>Orden de Preparación de Bodega</h2>
    <span class="prio-badge">${priority.label.toUpperCase()}</span>
  </div>
</div>

<!-- DATOS DEL PEDIDO -->
<div class="meta">
  <div class="meta-col">
    <div class="meta-row"><span class="mk">N° Pedido</span><span class="mv"><strong>${list.id}</strong></span></div>
    <div class="meta-row"><span class="mk">Cliente</span><span class="mv">${escapeHtml(list.clientName)}</span></div>
    <div class="meta-row"><span class="mk">Referencia</span><span class="mv">${list.orderRef || '—'}</span></div>
    <div class="meta-row"><span class="mk">Estado actual</span><span class="mv">${status.label}</span></div>
  </div>
  <div class="meta-col">
    <div class="meta-row"><span class="mk">Fecha pedido</span><span class="mv">${list.date}</span></div>
    <div class="meta-row"><span class="mk">Operario asignado</span><span class="mv"><strong>${list.operator || '—'}</strong></span></div>
    <div class="meta-row"><span class="mk">Prioridad</span><span class="mv"><strong>${priority.label}</strong></span></div>
    <div class="meta-row"><span class="mk">Fecha de impresión</span><span class="mv">${printDate}</span></div>
  </div>
</div>

<!-- TABLA DE PRODUCTOS -->
<div class="section-bar">Ruta de Recogida en Bodega — ${ordered.length} línea${ordered.length !== 1 ? 's' : ''} · ${totalUnits} unidad${totalUnits !== 1 ? 'es' : ''} total</div>
<div class="route-note">Recorrido optimizado FEFO (First Expired First Out) &nbsp;·&nbsp; Secuencia: Pasillo A → B → C → D para minimizar desplazamientos</div>

<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Producto</th>
      <th>SKU</th>
      <th>Bodega</th>
      <th>Pasillo</th>
      <th>Estante</th>
      <th>Nivel</th>
      <th>N° Lote</th>
      <th>Vencimiento</th>
      <th style="text-align:center;">Cant.</th>
      <th style="text-align:center;">✓ Rec.</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="9" style="text-align:right;">TOTAL UNIDADES SOLICITADAS →</td>
      <td style="text-align:center;font-size:14pt;">${totalUnits}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

${nearExpiry.length > 0 ? `<p style="margin-top:6px;font-size:8pt;color:#b91c1c;">⚠ ${nearExpiry.length} producto(s) marcados en rojo vencen en menos de 30 días — dar salida prioritaria (FEFO).</p>` : ''}

<!-- BLOQUE DE FIRMAS -->
<div class="sigs">
  <div class="sig"><strong>Operario de Bodega</strong>${list.operator || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}<br><small>Nombre y Firma</small></div>
  <div class="sig"><strong>Supervisor / Verificador</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br><small>Nombre y Firma</small></div>
  <div class="sig"><strong>Fecha y Hora de Despacho</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br><small>DD / MM / AAAA — HH : MM</small></div>
</div>

<div class="footer">
  Generado por AUREO · Sistema de Gestión de Ferretería · ${printDate} &nbsp;|&nbsp; Documento de uso interno — no válido como comprobante fiscal.
</div>

</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
}
