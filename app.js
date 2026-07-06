// AUREO - Core Logística de Depósito & Suministro Industrial

// --------------------------------------------------------------------------
//   CAPA API — sincroniza con el backend cuando está disponible.
//   Si el backend no está corriendo, todo sigue funcionando con localStorage.
// --------------------------------------------------------------------------
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';

function _apiToken() {
    try { return JSON.parse(localStorage.getItem('vulcan_session') || 'null')?.token || null; }
    catch { return null; }
}

async function apiGet(endpoint) {
    const token = _apiToken();
    if (!token) return null;
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

function apiPut(endpoint, data) {
    const token = _apiToken();
    if (!token) return;
    fetch(`${API_BASE}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
    }).catch(() => { });
}

// --------------------------------------------------------------------------
//   SANITIZACIÓN — escapa datos editables por el usuario antes de inyectarlos
//   con innerHTML/document.write. Previene XSS (crítico si esto pasa a un
//   backend multiusuario) y roturas de layout por caracteres < > & " '.
// --------------------------------------------------------------------------
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Verifica que la librería XLSX (CDN externo) esté cargada antes de usarla.
// Si el CDN falló, avisamos con un toast en vez de romper con ReferenceError.
function _ensureXLSX() {
    if (typeof XLSX === 'undefined') {
        if (typeof triggerToast === 'function') {
            triggerToast('error', 'El módulo de Excel no se cargó (revisa tu conexión). Intenta recargar la página.');
        }
        return false;
    }
    return true;
}

// --- CORE SYSTEM STATE ---
let state = {
    products: [],
    invoices: [],
    settings: {
        companyName: "Aureo S.A.S.",
        companySlogan: "Suministros de Acero e Ingeniería",
        currency: "COP",
        currencySymbol: "$",
        taxRate: 19,
        taxId: "NIT 901.456.789-0"
    },
    activeTab: 'dashboard',
    // Current invoice builder draft state
    invoiceItems: [],
    // Preparación de pedidos / Picking
    pickingLists: [],
    activePickingSub: 'panel',
    activePickingId: null,
    // Ingreso de Datos
    materials: [],
    suppliers: [],
    locations: [],
    movements: [],
    transit: [],
    labels: []
};

// --- INITIAL INDUSTRIAL DEMO DATA (catalogo vive en demo-data.js) ---
const DEMO_PRODUCTS = (typeof DEMO_DATA !== 'undefined') ? DEMO_DATA.products : [];
const DEMO_INVOICES = (typeof DEMO_DATA !== 'undefined') ? DEMO_DATA.buildInvoices(new Date()) : [];

// --- INITIALIZE APPLICATION ---
document.addEventListener("DOMContentLoaded", async () => {
    await loadDatabase();
    updateDateDisplay();
    switchTab('dashboard');

    // Auto focus tooltip logic on trend chart
    setupChartTooltipInteraction();
});

// Update top header date representation
function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date();
    document.getElementById("current-date-display").innerText = today.toLocaleDateString('es-ES', options);

    // Set dynamic invoice preview date
    const dateFormatted = today.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById("preview-invoice-date").innerText = dateFormatted;
}

// --- DATABASE PERSISTENCE MANAGEMENT ---
async function loadDatabase() {
    // Intentar cargar datos desde el backend; si no está disponible usa localStorage
    const [apiProducts, apiInvoices, apiSettings, apiPicking] = await Promise.all([
        apiGet('/api/products'),
        apiGet('/api/invoices'),
        apiGet('/api/settings'),
        apiGet('/api/picking')
    ]);

    // --- Productos ---
    if (apiProducts !== null && apiProducts.length > 0) {
        state.products = apiProducts;
        localStorage.setItem("aura_products", JSON.stringify(apiProducts));
    } else {
        const storedProducts = localStorage.getItem("aura_products");
        if (storedProducts) {
            state.products = JSON.parse(storedProducts);
            let updated = false;
            state.products.forEach(p => {
                if (!p.warehouse || ["Tecnología", "Audio", "Accesorios", "Oficina"].includes(p.category)) {
                    const catMap = { "Tecnología": "Herramientas Eléctricas", "Audio": "Consumibles", "Accesorios": "Herramientas Manuales", "Oficina": "Fijaciones" };
                    if (catMap[p.category]) p.category = catMap[p.category];
                    p.warehouse = p.warehouse || "Bodega Principal";
                    p.aisle = p.aisle || "C";
                    p.shelf = p.shelf || 1;
                    p.level = p.level || 1;
                    p.pickingDistance = p.pickingDistance || 25;
                    p.brand = p.brand || "Industrial";
                    p.supplier = p.supplier || "Distribuidor Oficial";
                    updated = true;
                }
            });
            if (updated) saveProductsToStorage();
        } else {
            // Sin productos en localStorage ni en API → cargar datos demo
            state.products = [...DEMO_PRODUCTS];
            saveProductsToStorage();
        }
        // Migrate expiry dates from DEMO_PRODUCTS catalog
        const _demoExpiryMap = {};
        DEMO_PRODUCTS.forEach(function (dp) { if (dp.expiry) _demoExpiryMap[dp.id] = dp.expiry; });
        let _expiryMigrated = false;
        state.products.forEach(function (p) {
            if (!p.expiry && _demoExpiryMap[p.id]) { p.expiry = _demoExpiryMap[p.id]; _expiryMigrated = true; }
        });
        if (_expiryMigrated) saveProductsToStorage();
        mergeSeedProducts();
    }

    // --- Facturas ---
    if (apiInvoices !== null) {
        state.invoices = apiInvoices;
        localStorage.setItem("aura_invoices", JSON.stringify(apiInvoices));
    } else {
        const storedInvoices = localStorage.getItem("aura_invoices");
        if (storedInvoices) {
            state.invoices = JSON.parse(storedInvoices);
        } else {
            state.invoices = [...DEMO_INVOICES];
            saveInvoicesToStorage();
        }
    }

    // --- Configuración ---
    if (apiSettings !== null) {
        state.settings = apiSettings;
        localStorage.setItem("aura_settings", JSON.stringify(apiSettings));
    } else {
        const storedSettings = localStorage.getItem("aura_settings");
        if (storedSettings) {
            state.settings = JSON.parse(storedSettings);
        } else {
            saveSettingsToStorage();
        }
    }

    // --- Picking ---
    if (apiPicking !== null) {
        state.pickingLists = apiPicking;
        localStorage.setItem("aura_picking", JSON.stringify(apiPicking));
    } else {
        if (!localStorage.getItem("aura_picking") && typeof DEMO_DATA !== 'undefined') {
            state.pickingLists = DEMO_DATA.buildPicking(new Date(), state.products, state.invoices);
            savePickingToStorage();
        }
        loadPickingLists();
    }

    // --- Ingreso de Datos ---
    const deKeys = ['materials', 'suppliers', 'locations', 'movements', 'transit', 'labels'];
    let _demoDE = null;
    deKeys.forEach(k => {
        const raw = localStorage.getItem(`vf_de_${k}`);
        if (raw) {
            state[k] = JSON.parse(raw);
        } else if (typeof DEMO_DATA !== 'undefined') {
            if (!_demoDE) _demoDE = DEMO_DATA.buildDE(new Date());
            state[k] = _demoDE[k] || [];
            saveDEKey(k);
        }
    });

    loadWMSLog();
    if (!localStorage.getItem('aura_wms_log') && typeof DEMO_DATA !== 'undefined') {
        state.wmsLog = DEMO_DATA.buildWmsLog(new Date(), state.products);
        localStorage.setItem('aura_wms_log', JSON.stringify(state.wmsLog));
    }
    applyVisualSettings();

    // --- Inventario ---
    const invTareasRaw = localStorage.getItem('aureo_inv_tareas');
    if (invTareasRaw) state.invTareas = JSON.parse(invTareasRaw);
    const invConteosRaw = localStorage.getItem('aureo_inv_conteos');
    if (invConteosRaw) state.invConteos = JSON.parse(invConteosRaw);
    const invReconteosRaw = localStorage.getItem('aureo_inv_reconteos');
    if (invReconteosRaw) state.invReconteos = JSON.parse(invReconteosRaw);
    if (!invTareasRaw && !invConteosRaw && typeof DEMO_DATA !== 'undefined') {
        const _demoInv = DEMO_DATA.buildInvData(new Date());
        state.invTareas = _demoInv.tareas;
        state.invConteos = _demoInv.conteos;
        state.invReconteos = _demoInv.reconteos;
        saveState();
    }
}

function saveProductsToStorage() {
    localStorage.setItem("aura_products", JSON.stringify(state.products));
    apiPut('/api/products', state.products);
}

// Versión del catálogo demo. Al subirla, los productos nuevos de DEMO_PRODUCTS
// se inyectan una sola vez en inventarios ya guardados, sin tocar lo existente.
const SEED_VERSION = 3;
function mergeSeedProducts() {
    const stored = parseInt(localStorage.getItem("aura_seed_version") || "1", 10);
    if (stored >= SEED_VERSION) return;

    const existingIds = new Set(state.products.map(p => p.id));
    let added = 0;
    DEMO_PRODUCTS.forEach(dp => {
        if (!existingIds.has(dp.id)) {
            state.products.push({ ...dp });
            added++;
        }
    });
    if (added > 0) saveProductsToStorage();
    localStorage.setItem("aura_seed_version", String(SEED_VERSION));
}

function saveInvoicesToStorage() {
    localStorage.setItem("aura_invoices", JSON.stringify(state.invoices));
    apiPut('/api/invoices', state.invoices);
}

function saveSettingsToStorage() {
    localStorage.setItem("aura_settings", JSON.stringify(state.settings));
    apiPut('/api/settings', state.settings);
}

function saveDEKey(key) {
    localStorage.setItem(`vf_de_${key}`, JSON.stringify(state[key]));
}

function saveState() {
    localStorage.setItem('aureo_inv_tareas', JSON.stringify(state.invTareas || []));
    localStorage.setItem('aureo_inv_conteos', JSON.stringify(state.invConteos || []));
    localStorage.setItem('aureo_inv_reconteos', JSON.stringify(state.invReconteos || []));
}

function applyVisualSettings() {
    // Apply currency, name, etc. to UI
    document.getElementById("profile-company-name").innerText = state.settings.companyName;
    document.getElementById("settings-company-name").value = state.settings.companyName;
    document.getElementById("settings-company-slogan").value = state.settings.companySlogan;
    document.getElementById("settings-company-currency").value = state.settings.currency;
    document.getElementById("settings-company-tax-id").value = state.settings.taxId;

    // Update company title logo initials if element exists
    const avatarBox = document.getElementById("brand-avatar-box");
    if (avatarBox) {
        const initials = state.settings.companyName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
        avatarBox.innerText = initials;
    }

    // Update invoice subtext
    document.getElementById("invoice-corp-sub").innerText = state.settings.companySlogan;
}

function saveCompanySettings(event) {
    event.preventDefault();

    state.settings.companyName = document.getElementById("settings-company-name").value;
    state.settings.companySlogan = document.getElementById("settings-company-slogan").value;
    state.settings.currency = document.getElementById("settings-company-currency").value;
    state.settings.taxId = document.getElementById("settings-company-tax-id").value;

    const symbolMap = { "USD": "$", "EUR": "€", "MXN": "$", "COP": "$" };
    state.settings.currencySymbol = symbolMap[state.settings.currency] || "$";

    saveSettingsToStorage();
    applyVisualSettings();

    triggerToast("success", "Parámetros técnicos actualizados correctamente.");

    // Reload state across tabs
    renderDashboard();
    renderInventory();
    populateProductSelector();
    updateInvoicePreview();
}

function resetSystemDatabase() {
    if (confirm("¿Estás seguro de que deseas formatear todos los datos del sistema? Se perderán las modificaciones personalizadas y el inventario volverá a su estado base.")) {
        [
            "aura_products", "aura_invoices", "aura_settings", "aura_picking",
            "aura_seed_version", "aura_wms_log",
            "vf_de_materials", "vf_de_suppliers", "vf_de_locations",
            "vf_de_movements", "vf_de_transit", "vf_de_labels",
            "aureo_inv_tareas", "aureo_inv_conteos", "aureo_inv_reconteos"
        ].forEach(k => localStorage.removeItem(k));

        // Resetear estado en memoria para que loadDatabase re-siembre limpio
        state.products = [];
        state.invoices = [];
        state.pickingLists = [];
        state.materials = [];
        state.suppliers = [];
        state.locations = [];
        state.movements = [];
        state.transit = [];
        state.labels = [];
        state.invTareas = [];
        state.invConteos = [];
        state.invReconteos = [];
        state.wmsLog = [];

        // Limpiar también el backend si está disponible
        const token = _apiToken();
        if (token) {
            fetch(`${API_BASE}/api/reset`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            }).catch(() => { });
        }

        loadDatabase().then(() => {
            triggerToast("success", "Depósito de datos formateado al estado inicial.");
            switchTab('dashboard');
        });
    }
}

// Helper: Format price based on settings currency
function formatCurrency(amount) {
    let locales = 'en-US';
    if (state.settings.currency === 'EUR') locales = 'de-DE';
    if (state.settings.currency === 'CLP') locales = 'es-CO';
    if (state.settings.currency === 'COP') locales = 'es-CO';

    return state.settings.currencySymbol + Number(amount).toLocaleString(locales, {
        minimumFractionDigits: state.settings.currency === 'CLP' || state.settings.currency === 'COP' ? 0 : 2,
        maximumFractionDigits: 2
    });
}

// --- TABS ROUTING SYSTEM ---
function switchTab(tabId) {
    console.log('[SWITCH]', tabId);
    state.activeTab = tabId;

    // Toggle active link class in sidebar
    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.remove("active");
    });
    const activeLink = document.getElementById(`nav-${tabId}`);
    if (activeLink) activeLink.classList.add("active");

    // Toggle active view container
    document.querySelectorAll(".page-container").forEach(page => {
        page.classList.remove("active");
    });
    const activePage = document.getElementById(`${tabId}-view`);
    if (activePage) activePage.classList.add("active");

    // Update headers
    const headerTitle = document.getElementById("header-view-title");
    const headerDesc = document.getElementById("header-view-desc");

    switch (tabId) {
        case 'dashboard':
            headerTitle.innerText = "Dashboard Operativo";
            headerDesc.innerText = "Control de transacciones y estado del depósito en tiempo real.";
            renderDashboard();
            break;
        case 'inventory':
            headerTitle.innerText = "Depósito Central";
            headerDesc.innerText = "Catálogo técnico, control de garantías e inventarios críticos.";
            renderInventory();
            break;
        case 'invoicing':
            headerTitle.innerText = "Terminal de Suministro";
            headerDesc.innerText = "Despacho de mercancía y facturación instantánea de facturas.";
            // Initialize draft if empty
            if (state.invoiceItems.length === 0) {
                initializeInvoiceBuilder();
            }
            populateProductSelector();
            updateInvoicePreview();
            break;
        case 'logistics':
            headerTitle.innerText = "Optimización WMS (Pareto)";
            headerDesc.innerText = "Rotación comercial y reubicación inteligente de herramientas en estanterías.";
            renderABCView();
            break;
        case 'picking':
            headerTitle.innerText = "Preparación de Pedidos";
            headerDesc.innerText = "Recorridos de bodega, productos por recoger y despacho de pedidos en tiempo real.";
            renderPicking();
            break;
        case 'inventario':
            headerTitle.innerText = "Inventario";
            headerDesc.innerText = "Gestión de conteos físicos, tareas de inventario y conciliación de existencias.";
            renderInventario();
            break;
        case 'dataentry':
            headerTitle.innerText = "Ingreso de Datos";
            headerDesc.innerText = "Panel centralizado para el registro y actualización de información del sistema.";
            renderDataEntry();
            break;
        case 'settings':
            headerTitle.innerText = "Parámetros Técnicos";
            headerDesc.innerText = "Configuraciones tributarias, moneda de operación y restablecimiento.";
            break;
    }
}

// ==========================================================================
//   MÓDULO: INVENTARIO
// ==========================================================================

const INV_SUBS = [
    { id: 'panel', label: 'Panel de inventarios', icon: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>' },
    { id: 'crear-tarea', label: 'Crear tarea', icon: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>' },
    { id: 'mis-conteos', label: 'Mis conteos', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
    { id: 'conteos', label: 'Conteos físicos', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { id: 'conciliacion', label: 'Conciliación', icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
    { id: 'reconteos', label: 'Reconteos', icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' },
    { id: 'informe', label: 'Informe inventario', icon: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="15" y2="11"/>' }
];

let activeInventarioSub = null;

function renderInventario() {
    const tabsContainer = document.getElementById('inventario-tabs');
    tabsContainer.innerHTML = INV_SUBS.map(sub => `
        <button class="dataentry-tab-btn ${activeInventarioSub === sub.id ? 'active' : ''}"
            onclick="switchInventarioSub('${sub.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                ${sub.icon}
            </svg>
            ${sub.label}
        </button>
    `).join('');

    if (activeInventarioSub) {
        switchInventarioSub(activeInventarioSub);
    }
}

function switchInventarioSub(subId) {
    activeInventarioSub = subId;
    const sub = INV_SUBS.find(s => s.id === subId);

    document.querySelectorAll('#inventario-tabs .dataentry-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === sub.label);
    });

    const content = document.getElementById('inventario-content');

    if (subId === 'panel') {
        const tareasActivas = (state.invTareas || []).filter(t => t.estado === 'activa').length;
        const pendientesConcil = (state.invConteos || []).filter(c => c.estado === 'pendiente').length;
        const reconteosAbiertos = (state.invReconteos || []).filter(r => r.estado === 'abierto').length;
        const diferencias = tareasActivas + pendientesConcil + reconteosAbiertos;

        content.innerHTML = `
            <div style="margin-top: 1.5rem;">
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                    <button class="btn btn-primary" onclick="switchInventarioSub('informe')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.4rem;">
                            <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                            <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                            <line x1="9" y1="15" x2="15" y2="15"/>
                            <line x1="9" y1="11" x2="15" y2="11"/>
                        </svg>
                        Ver informes
                    </button>
                    <button class="btn btn-secondary" onclick="switchInventarioSub('crear-tarea')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.4rem;">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Nueva tarea
                    </button>
                </div>

                <div class="stats-grid">
                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Tareas activas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${tareasActivas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">En ejecución</span>
                            <span class="stat-period">tareas de conteo</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes conciliación</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="18" y1="20" x2="18" y2="10"/>
                                    <line x1="12" y1="20" x2="12" y2="4"/>
                                    <line x1="6" y1="20" x2="6" y2="14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendientesConcil}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Requieren revisión</span>
                            <span class="stat-period">por conciliar</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-gold">
                        <div class="stat-header">
                            <span class="stat-title">Reconteos abiertos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${reconteosAbiertos}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Pendientes</span>
                            <span class="stat-period">reconteos activos</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Diferencias detectadas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${diferencias}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${diferencias > 0 ? 'down' : 'up'}">${diferencias > 0 ? 'Requieren atención' : 'Sin diferencias'}</span>
                            <span class="stat-period">total acumulado</span>
                        </div>
                    </div>
                </div>

                <div class="card" style="margin-top: 2rem;">
                    <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                            </svg>
                            Últimas tareas de inventario
                        </h2>
                    </div>
                    <div class="table-responsive" style="margin-top: 0;">
                        <table class="custom-table" style="font-size: 0.85rem;">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Tipo</th>
                                    <th>Ubicación</th>
                                    <th>Estado</th>
                                    <th>Responsable</th>
                                    <th>Fecha</th>
                                </tr>
                            </thead>
                            <tbody id="inv-panel-tabla">
                                ${(() => {
                const tareas = (state.invTareas || []).slice(-10).reverse();
                if (tareas.length === 0) return `
                                        <tr>
                                            <td colspan="6" style="text-align:center; color:var(--text-secondary); padding: 2rem;">
                                                No hay tareas registradas.
                                            </td>
                                        </tr>`;
                return tareas.map(t => `
                                        <tr>
                                            <td><span class="badge badge-info">${t.codigo || '—'}</span></td>
                                            <td>${t.tipo || '—'}</td>
                                            <td>${t.ubicacion || '—'}</td>
                                            <td><span class="badge ${t.estado === 'activa' ? 'badge-success' : t.estado === 'pendiente' ? 'badge-warning' : 'badge-info'}">${t.estado || '—'}</span></td>
                                            <td>${t.responsable || '—'}</td>
                                            <td>${t.fecha || '—'}</td>
                                        </tr>`).join('');
            })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    if (subId === 'crear-tarea') {
        content.innerHTML = `
            <div class="resp-grid-2-900" style="margin-top: 1.5rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start;">

                <!-- Creación de orden -->
                <div class="card">
                    <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Creación de orden
                        </h2>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Código</label>
                        <input type="text" class="form-input" id="inv-tarea-codigo" placeholder="Auto-generado" readonly
                            style="opacity: 0.6; cursor: default;">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Tipo de conteo</label>
                        <select class="form-select" id="inv-tarea-tipo" onchange="invActualizarResumen()">
                            <option value="">— Seleccionar —</option>
                            <option value="Zona">Zona</option>
                            <option value="Familia">Familia</option>
                            <option value="Material">Material</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Zona</label>
                        <input type="text" class="form-input" id="inv-tarea-zona"
                            placeholder="Ej: Bodega Principal - Pasillo A" oninput="invActualizarResumen()">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Asignado a</label>
                        <input type="text" class="form-input" id="inv-tarea-asignado"
                            placeholder="Nombre del responsable" oninput="invActualizarResumen()">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Creado por</label>
                        <input type="text" class="form-input" id="inv-tarea-creadopor"
                            placeholder="Nombre de quien crea la tarea" oninput="invActualizarResumen()">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Observación</label>
                        <textarea class="form-input" id="inv-tarea-obs" rows="3"
                            placeholder="Notas adicionales sobre la tarea..." oninput="invActualizarResumen()"
                            style="resize: vertical; font-family: inherit;"></textarea>
                    </div>

                    <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
                        <button class="btn btn-primary" onclick="invGuardarTarea()" style="flex: 1;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style="margin-right: 0.4rem;">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Guardar tarea
                        </button>
                        <button class="btn btn-secondary" onclick="invLimpiarFormTarea()">
                            Limpiar
                        </button>
                    </div>
                </div>

                <!-- Resumen operativo -->
                <div class="card" id="inv-resumen-card">
                    <div class="card-header" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                                <line x1="9" y1="15" x2="15" y2="15"/>
                                <line x1="9" y1="11" x2="15" y2="11"/>
                            </svg>
                            Resumen operativo
                        </h2>
                        <span class="badge badge-info" id="inv-resumen-badge">Borrador</span>
                    </div>
                    <div id="inv-resumen-body">
                        <div style="text-align: center; color: var(--text-secondary); padding: 3rem 1rem; font-size: 0.88rem;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                                stroke-linecap="round" stroke-linejoin="round" width="40" height="40"
                                style="display: block; margin: 0 auto 1rem; opacity: 0.35;">
                                <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                                <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                            </svg>
                            Completa el formulario para ver el resumen de la tarea.
                        </div>
                    </div>
                </div>

            </div>
        `;

        const codigo = 'INV-' + String((state.invTareas || []).length + 1).padStart(4, '0');
        document.getElementById('inv-tarea-codigo').value = codigo;
        invActualizarResumen();
        return;
    }

    if (subId === 'mis-conteos') {
        const tareas = state.invTareas || [];
        const total = tareas.length;
        const pendientes = tareas.filter(t => t.estado === 'pendiente').length;
        const enProceso = tareas.filter(t => t.estado === 'activa').length;
        const reconteos = (state.invReconteos || []).length;

        content.innerHTML = `
            <div style="margin-top: 1.5rem;">
                <div class="stats-grid">
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Total de tareas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${total}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Registradas</span>
                            <span class="stat-period">en el sistema</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-gold">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendientes}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${pendientes > 0 ? 'down' : 'up'}">${pendientes > 0 ? 'Por iniciar' : 'Al día'}</span>
                            <span class="stat-period">tareas pendientes</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">En proceso</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${enProceso}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">Activas</span>
                            <span class="stat-period">en ejecución</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Reconteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${reconteos}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${reconteos > 0 ? 'down' : 'up'}">${reconteos > 0 ? 'Requieren revisión' : 'Sin reconteos'}</span>
                            <span class="stat-period">abiertos</span>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:1.25rem; margin-top:1.5rem; align-items:flex-start; flex-wrap:wrap;">

                <!-- CONSULTA -->
                <div class="card" style="flex:1; min-width:0;">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Consulta de tareas
                        </h2>
                    </div>
                    <div class="table-controls" style="margin-bottom:1rem; flex-wrap:wrap; gap:0.6rem;">
                        <div class="input-wrapper" style="flex:1; min-width:160px;">
                            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <input type="text" class="form-input" id="mc-buscar-asignado" placeholder="Asignado a...">
                        </div>
                        <div style="min-width:170px;">
                            <select class="form-select" id="mc-filtro-estado">
                                <option value="todos">Todos los estados</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="en proceso">En proceso</option>
                                <option value="reconteo pendiente">Reconteo pendiente</option>
                                <option value="conciliada">Conciliada</option>
                                <option value="cerrada">Cerrada</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="filtrarMisConteos()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary" onclick="recargarMisConteos()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                            </svg>
                            Recargar
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Tipo</th>
                                    <th>Criterio</th>
                                    <th>Asignado</th>
                                    <th>Estado</th>
                                    <th>Reconteo</th>
                                </tr>
                            </thead>
                            <tbody id="mc-tabla-body"></tbody>
                        </table>
                    </div>
                </div>

                <!-- DETALLE RÁPIDO -->
                <div class="card" style="width:300px; flex-shrink:0; position:sticky; top:80px;">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            Detalle rápido
                        </h2>
                    </div>
                    <div id="mc-detalle-panel">
                        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                                style="width:40px;height:40px; margin:0 auto 0.75rem; display:block; opacity:0.35;">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                            </svg>
                            <p style="font-size:0.85rem;">Selecciona una tarea<br>para ver el detalle</p>
                        </div>
                    </div>
                </div>

            </div>
        `;
        filtrarMisConteos();
        return;
    }

    if (subId === 'conteos') {
        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <!-- Tarjetas de resumen -->
                <div class="stats-grid" style="margin-bottom:1.5rem;">
                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Total conteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).length}</div>
                        <div class="stat-meta"><span class="stat-trend up">Registrados</span></div>
                    </div>
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">En proceso</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).filter(c => c.estado === 'en proceso').length}</div>
                        <div class="stat-meta"><span class="stat-trend up">Activos</span></div>
                    </div>
                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).filter(c => c.estado === 'pendiente').length}</div>
                        <div class="stat-meta"><span class="stat-trend down">Sin finalizar</span></div>
                    </div>
                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Completados</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${(state.invConteos || []).filter(c => c.estado === 'completado').length}</div>
                        <div class="stat-meta"><span class="stat-trend up">Finalizados</span></div>
                    </div>
                </div>

                <!-- Consulta de conteos -->
                <div class="card">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Consulta de conteos
                        </h2>
                    </div>

                    <div class="table-controls" style="margin-bottom:1rem; flex-wrap:wrap; gap:0.6rem;">
                        <div class="input-wrapper" style="flex:1; min-width:160px;">
                            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <input type="text" class="form-input" id="cf-buscar-id"
                                placeholder="ID de tarea...">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width:160px;">
                            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <input type="text" class="form-input" id="cf-buscar-usuario"
                                placeholder="Usuario que registra...">
                        </div>
                        <button class="btn btn-primary" onclick="filtrarConteosF()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary" onclick="recargarConteosF()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                            </svg>
                            Recargar
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="custom-table" style="font-size:0.82rem;">
                            <thead>
                                <tr>
                                    <th>Detalle</th>
                                    <th>Ubicación</th>
                                    <th>Zona</th>
                                    <th>Cód. Material</th>
                                    <th>Descripción</th>
                                    <th>Lote Almacén</th>
                                    <th>Lote Proveedor</th>
                                    <th>FV</th>
                                    <th>Cant. Contada</th>
                                    <th>Observación</th>
                                </tr>
                            </thead>
                            <tbody id="cf-tabla-body"></tbody>
                        </table>
                    </div>

                    <!-- Botones de acción -->
                    <div style="display:flex; gap:0.75rem; margin-top:1.5rem; flex-wrap:wrap;">
                        <button class="btn btn-secondary" onclick="switchInventarioSub('mis-conteos')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            Volver a mis conteos
                        </button>
                        <button class="btn btn-primary" onclick="guardarConteoF()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                <polyline points="17 21 17 13 7 13 7 21"/>
                                <polyline points="7 3 7 8 15 8"/>
                            </svg>
                            Guardar conteo
                        </button>
                        <button class="btn btn-secondary" onclick="switchInventarioSub('conciliacion')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <line x1="18" y1="20" x2="18" y2="10"/>
                                <line x1="12" y1="20" x2="12" y2="4"/>
                                <line x1="6" y1="20" x2="6" y2="14"/>
                            </svg>
                            Ir a conciliación
                        </button>
                    </div>
                </div>

            </div>
        `;
        filtrarConteosF();
        return;
    }

    if (subId === 'conciliacion') {
        const conteos = state.invConteos || [];
        const tareas = state.invTareas || [];
        const totalItems = conteos.length;
        const sinDiferencia = conteos.filter(c => (c.cantidadContada ?? 0) === (c.cantidadSistema ?? 0)).length;
        const conDiferencia = conteos.filter(c => (c.cantidadContada ?? 0) !== (c.cantidadSistema ?? 0)).length;
        const pendConcil = conteos.filter(c => c.estado === 'pendiente').length;

        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <!-- Resumen -->
                <div class="stats-grid" style="margin-bottom:1.5rem;">
                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Total ítems</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${totalItems}</div>
                        <div class="stat-meta"><span class="stat-trend up">En conciliación</span></div>
                    </div>
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Sin diferencia</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${sinDiferencia}</div>
                        <div class="stat-meta"><span class="stat-trend up">Cuadran</span></div>
                    </div>
                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Con diferencia</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${conDiferencia}</div>
                        <div class="stat-meta"><span class="stat-trend down">Requieren acción</span></div>
                    </div>
                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Pend. conciliación</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendConcil}</div>
                        <div class="stat-meta"><span class="stat-trend down">Sin resolver</span></div>
                    </div>
                </div>

                <!-- Tabla comparativa -->
                <div class="card">
                    <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                        <h2 class="card-title">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                            </svg>
                            Comparativo Sistema vs Físico
                        </h2>
                    </div>

                    <!-- Filtros -->
                    <div class="table-controls" style="margin-bottom:1rem; flex-wrap:wrap; gap:0.6rem;">
                        <div class="input-wrapper" style="flex:1; min-width:150px;">
                            <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <input type="text" class="form-input" id="conc-buscar-tarea"
                                placeholder="ID de tarea...">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width:150px;">
                            <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <input type="text" class="form-input" id="conc-buscar-usuario"
                                placeholder="Usuario que finaliza...">
                        </div>
                        <div class="input-wrapper" style="flex:1; min-width:150px;">
                            <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                            <input type="text" class="form-input" id="conc-buscar-reconteo"
                                placeholder="Asignado a reconteo (opcional)...">
                        </div>
                        <button class="btn btn-primary" onclick="filtrarConciliacion()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            Buscar
                        </button>
                        <button class="btn btn-secondary" onclick="recargarConciliacion()" style="white-space:nowrap;">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
                            </svg>
                            Recargar
                        </button>
                    </div>

                    <div class="table-responsive">
                        <table class="custom-table" style="font-size:0.82rem;">
                            <thead>
                                <tr>
                                    <th>Detalle</th>
                                    <th>Ubicación</th>
                                    <th>Código</th>
                                    <th>Descripción</th>
                                    <th>Lote Almacén</th>
                                    <th>Lote Proveedor</th>
                                    <th>Sistema</th>
                                    <th>Contado</th>
                                    <th>Diferencia</th>
                                    <th>Coincide</th>
                                    <th>Observación</th>
                                </tr>
                            </thead>
                            <tbody id="conc-tabla-body"></tbody>
                        </table>
                    </div>

                    <!-- Botones de cierre -->
                    <div style="display:flex; gap:0.75rem; margin-top:1.5rem; flex-wrap:wrap; align-items:center;">
                        <button class="btn btn-secondary" onclick="switchInventarioSub('conteos')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="15 18 9 12 15 6"/>
                            </svg>
                            Volver a conteos
                        </button>
                        <div style="flex:1;"></div>
                        <button class="btn btn-secondary" onclick="generarReconteoAuto()" style="border-color:var(--accent-amber,#f59e0b); color:var(--accent-amber,#f59e0b);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                            </svg>
                            Generar reconteo automático
                        </button>
                        <button class="btn btn-primary" onclick="cerrarTareaConciliacion()" style="background:var(--accent-emerald,#10b981); border-color:var(--accent-emerald,#10b981);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            Cerrar tarea
                        </button>
                    </div>
                </div>

            </div>
        `;
        filtrarConciliacion();
        return;
    }

    if (subId === 'reconteos') {
        const reconteos = state.invReconteos || [];
        const total = reconteos.length;
        const pendientes = reconteos.filter(r => r.estado === 'abierto' || r.estado === 'pendiente').length;
        const enProceso = reconteos.filter(r => r.estado === 'en proceso').length;
        const cerrados = reconteos.filter(r => r.estado === 'cerrado').length;

        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <div class="stats-grid" style="margin-bottom:1.5rem;">
                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Total reconteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${total}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Generados</span>
                            <span class="stat-period">desde conciliación</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Pendientes</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${pendientes}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${pendientes > 0 ? 'down' : 'up'}">${pendientes > 0 ? 'Sin iniciar' : 'Al día'}</span>
                            <span class="stat-period">por ejecutar</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-gold">
                        <div class="stat-header">
                            <span class="stat-title">En proceso</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="2" x2="12" y2="6"/>
                                    <line x1="12" y1="18" x2="12" y2="22"/>
                                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                                    <line x1="2" y1="12" x2="6" y2="12"/>
                                    <line x1="18" y1="12" x2="22" y2="12"/>
                                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${enProceso}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">En ejecución</span>
                            <span class="stat-period">conteos activos</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Cerrados</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${cerrados}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">Finalizados</span>
                            <span class="stat-period">conciliados</span>
                        </div>
                    </div>
                </div>

                <!-- Dos columnas -->
                <div style="display:flex; gap:1.25rem; align-items:flex-start;">

                    <!-- IZQUIERDA: Consulta de reconteos -->
                    <div class="card" style="flex:1; min-width:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Consulta de reconteos
                            </h2>
                        </div>

                        <div style="display:flex; gap:0.6rem; margin-bottom:1rem; flex-wrap:wrap;">
                            <div class="input-wrapper" style="flex:1; min-width:140px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                                </svg>
                                <input type="text" class="form-input" id="rc-buscar-asignado" placeholder="Asignado a...">
                            </div>
                            <div style="min-width:155px;">
                                <select class="form-select" id="rc-filtro-estado">
                                    <option value="todos">Todos los estados</option>
                                    <option value="pendiente">Pendiente</option>
                                    <option value="en proceso">En proceso</option>
                                    <option value="conciliada">Conciliada</option>
                                    <option value="cerrada">Cerrada</option>
                                </select>
                            </div>
                            <button class="btn btn-primary" onclick="filtrarReconteos()" style="white-space:nowrap;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Buscar
                            </button>
                        </div>

                        <div style="overflow-x:auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Origen</th>
                                        <th>Tipo</th>
                                        <th>Criterio</th>
                                        <th>Asignado</th>
                                        <th>Estado</th>
                                        <th style="text-align:center;">No coinciden</th>
                                        <th style="text-align:center;">Exactitud</th>
                                    </tr>
                                </thead>
                                <tbody id="rc-tabla-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- DERECHA: Acción rápida -->
                    <div class="card" style="width:340px; flex-shrink:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                                </svg>
                                Acción rápida
                            </h2>
                        </div>
                        <div id="rc-accion-body">
                            <div style="text-align:center; color:var(--text-secondary); padding:3rem 1rem; font-size:0.88rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40" style="display:block; margin:0 auto 1rem; opacity:0.35;">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                                Selecciona un reconteo de la tabla para ver las opciones.
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        `;
        filtrarReconteos();
        return;
    }

    if (subId === 'informe') {
        const tareas = state.invTareas || [];
        const conteos = state.invConteos || [];
        const reconteos = state.invReconteos || [];

        const totalTareas = tareas.length;
        const conciliadas = conteos.filter(c => c.estado === 'completado' && (c.cantidadContada ?? 0) === (c.cantidadSistema ?? 0)).length;
        const totalReconteos = reconteos.length;
        const abiertas = tareas.filter(t => t.estado === 'activa' || t.estado === 'pendiente').length;

        const tareasRows = tareas.length === 0
            ? '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:2rem;">Sin tareas registradas</td></tr>'
            : [...tareas].reverse().map(t => {
                const its = conteos.filter(c => c.tareaId === t.codigo);
                const cnt = its.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
                const coi = cnt.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
                const ex = cnt.length > 0 ? Math.round((coi / cnt.length) * 100) : null;
                const exHtml = ex === null
                    ? '<span style="color:var(--text-secondary);">—</span>'
                    : ex >= 95
                        ? '<span style="color:var(--accent-emerald);font-weight:600;">' + ex + '%</span>'
                        : ex >= 80
                            ? '<span style="color:#d97706;font-weight:600;">' + ex + '%</span>'
                            : '<span style="color:var(--accent-rose);font-weight:600;">' + ex + '%</span>';
                const eb = t.estado === 'completado' ? 'badge-success' : t.estado === 'activa' ? 'badge-info' : 'badge-warning';
                const rc = t.reconteo ? '<code style="font-size:0.79rem;">' + t.reconteo + '</code>' : '<span style="color:var(--text-secondary);">—</span>';
                return '<tr>'
                    + '<td><code style="font-size:0.8rem;">' + (t.codigo || '—') + '</code></td>'
                    + '<td>' + (t.tipo || '—') + '</td>'
                    + '<td>' + (t.criterio || '—') + '</td>'
                    + '<td><span class="badge ' + eb + '">' + (t.estado || '—') + '</span></td>'
                    + '<td style="text-align:center;">' + exHtml + '</td>'
                    + '<td style="text-align:center;">' + rc + '</td>'
                    + '</tr>';
            }).join('');

        content.innerHTML = `
            <div style="margin-top:1.5rem;">

                <div class="stats-grid" style="margin-bottom:1.5rem;">

                    <div class="card stat-card stat-cyan">
                        <div class="stat-header">
                            <span class="stat-title">Total tareas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${totalTareas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend neutral">Registradas</span>
                            <span class="stat-period">en sistema</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-emerald">
                        <div class="stat-header">
                            <span class="stat-title">Conciliadas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${conciliadas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend up">Sin diferencias</span>
                            <span class="stat-period">exactas</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-amber">
                        <div class="stat-header">
                            <span class="stat-title">Reconteos</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="17 1 21 5 17 9"/>
                                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                                    <polyline points="7 23 3 19 7 15"/>
                                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${totalReconteos}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${totalReconteos > 0 ? 'down' : 'neutral'}">Generados</span>
                            <span class="stat-period">por diferencias</span>
                        </div>
                    </div>

                    <div class="card stat-card stat-rose">
                        <div class="stat-header">
                            <span class="stat-title">Abiertas</span>
                            <div class="stat-icon-wrapper">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <polyline points="12 6 12 12 16 14"/>
                                </svg>
                            </div>
                        </div>
                        <div class="stat-value">${abiertas}</div>
                        <div class="stat-meta">
                            <span class="stat-trend ${abiertas > 0 ? 'down' : 'up'}">${abiertas > 0 ? 'Pendientes' : 'Al día'}</span>
                            <span class="stat-period">en proceso</span>
                        </div>
                    </div>

                </div>

                <div style="display:flex; gap:1.25rem; align-items:flex-start;">

                    <!-- IZQUIERDA: Listado de tareas -->
                    <div class="card" style="flex:1; min-width:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"/>
                                    <line x1="8" y1="12" x2="21" y2="12"/>
                                    <line x1="8" y1="18" x2="21" y2="18"/>
                                    <line x1="3" y1="6" x2="3.01" y2="6"/>
                                    <line x1="3" y1="12" x2="3.01" y2="12"/>
                                    <line x1="3" y1="18" x2="3.01" y2="18"/>
                                </svg>
                                Listado de tareas
                            </h2>
                        </div>
                        <div style="overflow-x:auto;">
                            <table class="data-table" style="width:100%; border-collapse:collapse;">
                                <colgroup>
                                    <col style="width:110px;">
                                    <col style="width:90px;">
                                    <col>
                                    <col style="width:100px;">
                                    <col style="width:80px;">
                                    <col style="width:100px;">
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Tipo</th>
                                        <th>Criterio</th>
                                        <th style="text-align:center;">Estado</th>
                                        <th style="text-align:center;">Exactitud</th>
                                        <th style="text-align:center;">Reconteo</th>
                                    </tr>
                                </thead>
                                <tbody>${tareasRows}</tbody>
                            </table>
                        </div>
                    </div>

                    <!-- DERECHA: Consulta por ID -->
                    <div class="card" style="width:320px; flex-shrink:0;">
                        <div class="card-header" style="border-bottom:1px solid var(--border-subtle); padding-bottom:1rem; margin-bottom:1.25rem;">
                            <h2 class="card-title">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Consulta por ID
                            </h2>
                        </div>
                        <div style="display:flex; gap:0.5rem; margin-bottom:0.75rem; flex-wrap:wrap;">
                            <div class="input-wrapper" style="flex:1; min-width:120px;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4 6h16M4 12h16M4 18h7"/>
                                </svg>
                                <input type="text" class="form-input" id="inf-buscar-id" placeholder="INV-0001..." onkeydown="if(event.key==='Enter')buscarTareaInforme()">
                            </div>
                            <button class="btn btn-primary" onclick="buscarTareaInforme()" title="Consultar" style="padding:0 0.65rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                            </button>
                            <button class="btn btn-secondary" onclick="document.getElementById('inf-buscar-id').value='';buscarTareaInforme();" title="Recargar" style="padding:0 0.65rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                                </svg>
                            </button>
                            <button class="btn btn-secondary" onclick="imprimirTareaInforme()" title="Imprimir tarea" style="padding:0 0.65rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                                    <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                                </svg>
                            </button>
                        </div>
                        <div id="inf-detalle-tarea">
                            <div style="text-align:center; color:var(--text-secondary); padding:2.5rem 1rem; font-size:0.88rem;">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="38" height="38" style="display:block; margin:0 auto 0.75rem; opacity:0.3;">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                                Ingresa un ID de tarea para ver el detalle.
                            </div>
                        </div>
                    </div>

                </div>

                <div id="inf-reporte-tarea" style="margin-top:1.5rem;"></div>

            </div>
        `;
        return;
    }

    content.innerHTML = `
        <div class="card" style="margin-top: 1.5rem;">
            <div class="card-header">
                <h2 class="card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        ${sub.icon}
                    </svg>
                    ${sub.label}
                </h2>
            </div>
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
                Módulo <strong>${sub.label}</strong> en construcción.
            </div>
        </div>
    `;
}

function renderInformeCompletoTarea(tarea, items) {
    const empresa = state.settings?.companyName || 'Áureo S.A.';
    const slogan = state.settings?.companySlogan || 'Control logístico';
    const initials = empresa.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const BRAND = '#2E4A6E';
    const BRAND_LT = '#EBF0F7';
    const GRAY = '#6E6354';
    const BORDER = '#D8D0C0';

    const contados = items.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
    const coinciden = contados.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
    const noCoinciden = contados.length - coinciden;
    const exactitud = contados.length > 0 ? Math.round((coinciden / contados.length) * 100) : 0;
    const totalSistema = items.reduce((s, c) => s + (parseFloat(c.cantidadSistema) || 0), 0);
    const totalContado = contados.reduce((s, c) => s + (parseFloat(c.cantidadContada) || 0), 0);
    const desviacion = contados.length > 0 ? totalContado - totalSistema : null;

    const v = x => x || '—';

    const metaCell = (label, value) =>
        '<td style="border:1px solid ' + BORDER + '; padding:0.6rem 0.8rem; vertical-align:top; width:25%;">'
        + '<div style="font-size:0.68rem; color:' + BRAND + '; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.25rem;">' + label + '</div>'
        + '<div style="font-size:0.9rem; font-weight:700; color:#1a1a1a;">' + value + '</div>'
        + '</td>';

    const statCell = (label, value, color) =>
        '<td style="border:1px solid ' + BORDER + '; padding:0.6rem 0.8rem; vertical-align:top; width:25%;">'
        + '<div style="font-size:0.68rem; color:' + (color || BRAND) + '; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.25rem;">' + label + '</div>'
        + '<div style="font-size:1rem; font-weight:700; color:' + (color || '#1a1a1a') + ';">' + value + '</div>'
        + '</td>';

    const hojaTh = col => '<th style="background:#f1ede3; border:1px solid ' + BORDER + '; padding:0.35rem 0.45rem; font-size:0.68rem; font-weight:700; color:' + BRAND + '; white-space:nowrap;">' + col + '</th>';
    const hojaTd = val => '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.45rem; font-size:0.72rem; color:#1a1a1a; white-space:nowrap;">' + v(val) + '</td>';

    const difTh = col => '<th style="background:#f1ede3; border:1px solid ' + BORDER + '; padding:0.35rem 0.6rem; font-size:0.7rem; font-weight:700; color:' + BRAND + ';">' + col + '</th>';
    const difTd = (val, extra) => '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.6rem; font-size:0.73rem;' + (extra || '') + '">' + v(val) + '</td>';

    const hojaRows = items.length === 0
        ? '<tr><td colspan="14" style="text-align:center; padding:1rem; color:' + GRAY + '; font-size:0.8rem;">Sin líneas registradas</td></tr>'
        : items.map((c, i) => '<tr>'
            + hojaTd(c.detalle || (300 + i + 1))
            + hojaTd(c.ubicacion)
            + hojaTd(c.base)
            + hojaTd(c.posicion)
            + hojaTd(c.zona)
            + hojaTd(c.codigoMaterial)
            + hojaTd(c.descripcion)
            + hojaTd(c.familia)
            + hojaTd(c.um)
            + hojaTd(c.loteAlmacen)
            + hojaTd(c.loteProveedor)
            + hojaTd(c.fechaVencimiento)
            + hojaTd(c.cantidadSistema)
            + hojaTd(c.obs)
            + '</tr>').join('');

    const difRows = items.length === 0
        ? '<tr><td colspan="9" style="text-align:center; padding:1rem; color:' + GRAY + '; font-size:0.8rem;">Sin líneas</td></tr>'
        : items.map((c, i) => {
            const diff = (c.cantidadContada !== null && c.cantidadContada !== undefined)
                ? parseFloat(c.cantidadContada) - parseFloat(c.cantidadSistema) : null;
            const coinc = diff === null ? 'Pendiente' : diff === 0 ? 'Sí' : 'No';
            const diffColor = diff === null ? GRAY : diff === 0 ? '#3a6e3a' : '#a8442c';
            return '<tr>'
                + difTd(c.detalle || (300 + i + 1))
                + difTd(c.ubicacion)
                + difTd(c.codigoMaterial)
                + difTd(c.descripcion)
                + difTd(c.cantidadSistema)
                + difTd(c.cantidadContada)
                + '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.6rem; font-size:0.73rem; color:' + diffColor + '; font-weight:600;">' + (diff !== null ? (diff > 0 ? '+' : '') + diff : '—') + '</td>'
                + '<td style="border:1px solid ' + BORDER + '; padding:0.32rem 0.6rem; font-size:0.73rem; color:' + diffColor + ';">' + coinc + '</td>'
                + difTd(c.obs)
                + '</tr>';
        }).join('');

    const hayDiferencias = noCoinciden > 0;
    const resumenColor = hayDiferencias ? '#fff3cd' : '#d4edda';
    const resumenBorder = hayDiferencias ? '#f0c65e' : '#92c49a';
    const resumenText = hayDiferencias ? '#7a5c00' : '#1f5c2e';
    const resumenMsg = hayDiferencias
        ? 'Se detectaron <strong>' + noCoinciden + '</strong> diferencia(s) en la tarea. Se requiere revisión o reconteo.'
        : 'No se detectaron diferencias en la tarea. El conteo coincide con el stock del sistema.';

    const secTitle = (icon, label) =>
        '<div style="display:flex; align-items:center; gap:0.5rem; font-size:0.95rem; font-weight:700; color:#1a1a1a; margin:1.5rem 0 0.75rem;">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="' + BRAND + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17">' + icon + '</svg>'
        + label + '</div>';

    const sigLine = label =>
        '<div style="flex:1; text-align:center;">'
        + '<div style="border-top:1px solid #999; margin-bottom:0.4rem;"></div>'
        + '<div style="font-size:0.75rem; color:' + GRAY + ';">' + label + '</div>'
        + '</div>';

    return '<div style="background:#ffffff; border:1px solid ' + BORDER + '; border-radius:8px; padding:2rem; font-family:Arial,sans-serif; font-size:13px; color:#1a1a1a;">'

        // ── HEADER ──
        + '<div style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; margin-bottom:1.25rem; border-bottom:2.5px solid ' + BRAND + ';">'
        + '<div style="display:flex; align-items:center; gap:0.9rem;">'
        + '<div style="width:48px; height:48px; border-radius:50%; background:' + BRAND + '; display:flex; align-items:center; justify-content:center; flex-shrink:0;">'
        + '<span style="color:#fff; font-size:1.2rem; font-weight:800; letter-spacing:-1px;">' + initials + '</span>'
        + '</div>'
        + '<div>'
        + '<div style="font-size:1rem; font-weight:800; color:' + BRAND + '; line-height:1.1;">' + empresa + '</div>'
        + '<div style="font-size:0.72rem; color:' + GRAY + '; margin-bottom:0.35rem;">' + slogan + '</div>'
        + '<div style="font-size:1.15rem; font-weight:800; color:#1a1a1a; line-height:1.1;">INFORME DE INVENTARIO</div>'
        + '<div style="font-size:0.7rem; color:' + GRAY + ';">Documento operativo de tarea de inventario</div>'
        + '</div>'
        + '</div>'
        + '<div style="font-size:0.88rem; font-weight:800; color:' + BRAND + '; border:1.5px solid ' + BRAND + '; border-radius:5px; padding:0.3rem 0.75rem; white-space:nowrap;">TAREA ' + tarea.codigo + '</div>'
        + '</div>'

        // ── METADATA GRID ──
        + '<table style="width:100%; border-collapse:collapse; margin-bottom:0;">'
        + '<tr>' + metaCell('Estado', v(tarea.estado).toUpperCase()) + metaCell('Tipo de conteo', v(tarea.tipo)) + metaCell('Criterio', v(tarea.criterio)) + metaCell('Asignado a', v(tarea.asignado)) + '</tr>'
        + '<tr>' + metaCell('Creado por', v(tarea.creadopor)) + metaCell('Reconteo', tarea.reconteo ? 'Sí' : 'No') + metaCell('Fecha creación', v(tarea.fecha)) + metaCell('Fecha inicio', v(tarea.fechaInicio)) + '</tr>'
        + '<tr>' + metaCell('Fecha finalización', v(tarea.fechaFinalizacion)) + metaCell('Fecha conciliación', v(tarea.fechaConciliacion)) + metaCell('Fecha cierre', v(tarea.fechaCierre)) + metaCell('Tarea origen', v(tarea.tareaOrigen)) + '</tr>'
        + '</table>'

        // ── OBSERVACIÓN GENERAL ──
        + (tarea.obs ? '<div style="margin-top:1rem; padding:0.75rem 1rem; background:' + BRAND_LT + '; border-radius:5px; border-left:3px solid ' + BRAND + ';">'
            + '<div style="font-size:0.75rem; font-weight:700; color:' + BRAND + '; margin-bottom:0.25rem;">Observación general</div>'
            + '<div style="font-size:0.82rem; color:#1a1a1a;">' + tarea.obs + '</div>'
            + '</div>' : '')

        // ── STATS GRID ──
        + '<table style="width:100%; border-collapse:collapse; margin-top:1rem;">'
        + '<tr>' + statCell('Total líneas', items.length) + statCell('Líneas contadas', contados.length) + statCell('Coinciden', coinciden, '#3a6e3a') + statCell('No coinciden', noCoinciden, noCoinciden > 0 ? '#a8442c' : GRAY) + '</tr>'
        + '<tr>' + statCell('Exactitud', exactitud + '%', exactitud >= 95 ? '#3a6e3a' : exactitud >= 80 ? '#a87000' : '#a8442c') + statCell('Total sistema', totalSistema) + statCell('Total contado', contados.length > 0 ? totalContado : '—') + statCell('Desviación total', desviacion !== null ? (desviacion > 0 ? '+' : '') + desviacion : '—', desviacion !== null && desviacion !== 0 ? '#a8442c' : '#3a6e3a') + '</tr>'
        + '</table>'

        // ── HOJA DE CONTEO ──
        + secTitle('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>', 'Hoja de conteo')
        + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse; font-size:0.72rem;">'
        + '<thead><tr>' + ['Det.', 'Ubic.', 'Base', 'Pos.', 'Zona', 'Cod.', 'Desc.', 'Fam.', 'UM', 'Lote alm.', 'Lote prov.', 'FV', 'Cant.', 'Obs.'].map(hojaTh).join('') + '</tr></thead>'
        + '<tbody>' + hojaRows + '</tbody>'
        + '</table></div>'

        // ── ANÁLISIS DE DIFERENCIAS ──
        + secTitle('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 'Análisis de diferencias')
        + '<div style="overflow-x:auto;">'
        + '<table style="width:100%; border-collapse:collapse;">'
        + '<thead><tr>' + ['Detalle', 'Ubicación', 'Código material', 'Descripción', 'Sistema', 'Contado', 'Diferencia', 'Coincide', 'Observación'].map(difTh).join('') + '</tr></thead>'
        + '<tbody>' + difRows + '</tbody>'
        + '</table></div>'
        + '<div style="font-size:0.8rem; font-weight:700; color:#1a1a1a; margin:0.75rem 0 0.35rem;">Resumen de diferencias</div>'
        + '<div style="background:' + resumenColor + '; border:1px solid ' + resumenBorder + '; border-radius:5px; padding:0.6rem 0.9rem; font-size:0.8rem; color:' + resumenText + ';">' + resumenMsg + '</div>'

        // ── CIERRE DEL INFORME ──
        + secTitle('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 'Cierre del informe')
        + '<table style="width:100%; border-collapse:collapse;">'
        + '<tr>' + statCell('Estado final', v(tarea.estado).toUpperCase()) + statCell('Total líneas', items.length) + statCell('Coinciden', coinciden, '#3a6e3a') + statCell('No coinciden', noCoinciden, noCoinciden > 0 ? '#a8442c' : GRAY) + '</tr>'
        + '<tr>' + statCell('Exactitud', exactitud + '%') + statCell('Generó reconteo', tarea.reconteo ? 'Sí' : 'No') + statCell('ID reconteo generado', v(tarea.reconteo)) + '<td style="border:1px solid ' + BORDER + ';"></td>' + '</tr>'
        + '</table>'

        // ── FOOTER FIRMAS ──
        + '<div style="display:flex; gap:3rem; margin-top:2.5rem;">'
        + sigLine('Responsable conteo')
        + sigLine('Supervisor / validación')
        + sigLine('Aprobación final')
        + '</div>'

        + '</div>';
}

function buscarTareaInforme() {
    const q = (document.getElementById('inf-buscar-id')?.value || '').trim().toUpperCase();
    const panel = document.getElementById('inf-detalle-tarea');
    if (!panel) return;

    const clearRep = () => { const r = document.getElementById('inf-reporte-tarea'); if (r) r.innerHTML = ''; };

    if (!q) {
        panel.innerHTML = `
            <div style="text-align:center; color:var(--text-secondary); padding:2.5rem 1rem; font-size:0.88rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="38" height="38" style="display:block; margin:0 auto 0.75rem; opacity:0.3;">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Ingresa un ID de tarea para ver el detalle.
            </div>`;
        clearRep(); return;
    }

    const tarea = (state.invTareas || []).find(t => (t.codigo || '').toUpperCase().includes(q));
    if (!tarea) {
        panel.innerHTML = '<div style="text-align:center; color:var(--accent-rose); padding:2rem 1rem; font-size:0.88rem;">No se encontró ninguna tarea con ID <strong>' + q + '</strong>.</div>';
        clearRep(); return;
    }

    const conteos = state.invConteos || [];
    const items = conteos.filter(c => c.tareaId === tarea.codigo);
    const contados = items.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
    const coinciden = contados.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
    const exactitud = contados.length > 0 ? Math.round((coinciden / contados.length) * 100) : null;
    const exactColor = exactitud === null ? 'var(--text-secondary)' : exactitud >= 95 ? 'var(--accent-emerald)' : exactitud >= 80 ? '#d97706' : 'var(--accent-rose)';
    const estadoBadge = tarea.estado === 'completado' ? 'badge-success' : tarea.estado === 'activa' ? 'badge-info' : 'badge-warning';

    const noCoinciden = contados.length - coinciden;
    const tieneReconteo = !!tarea.reconteo;

    const kpi = (label, value, sub = '', color = 'var(--text-primary)') => `
        <div class="card" style="padding:0.75rem 0.9rem; flex:1; min-width:120px;">
            <div style="font-size:0.7rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.3rem;">${label}</div>
            <div style="font-size:1.15rem; font-weight:700; color:${color}; line-height:1.2;">${value}</div>
            ${sub ? `<div style="font-size:0.7rem; color:var(--text-secondary); margin-top:0.2rem;">${sub}</div>` : ''}
        </div>`;

    panel.innerHTML = `
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.5rem;">
            ${kpi('Tarea', '<code style="font-size:0.9rem;">' + tarea.codigo + '</code>')}
            ${kpi('Estado', '<span class="badge ' + estadoBadge + '" style="font-size:0.75rem;">' + (tarea.estado || '—') + '</span>')}
            ${kpi('Total líneas', items.length, 'ítems registrados')}
            ${kpi('Coinciden', coinciden, 'sin diferencia', 'var(--accent-emerald)')}
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            ${kpi('No coinciden', noCoinciden, 'con diferencia', noCoinciden > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)')}
            ${kpi('Exactitud', exactitud !== null ? exactitud + '%' : '—', 'precisión conteo', exactColor)}
            ${kpi('Genera reconteo', tieneReconteo ? 'Sí' : 'No', '', tieneReconteo ? '#d97706' : 'var(--text-secondary)')}
            ${kpi('ID reconteo', tarea.reconteo ? '<code style="font-size:0.8rem;">' + tarea.reconteo + '</code>' : '—')}
        </div>`;

    const rep = document.getElementById('inf-reporte-tarea');
    if (rep) rep.innerHTML = renderInformeCompletoTarea(tarea, items);
}

function imprimirTareaInforme() {
    const q = (document.getElementById('inf-buscar-id')?.value || '').trim().toUpperCase();
    const tarea = q ? (state.invTareas || []).find(t => (t.codigo || '').toUpperCase().includes(q)) : null;
    if (!tarea) { triggerToast('warning', 'Consulta una tarea antes de imprimir.'); return; }
    const items = (state.invConteos || []).filter(c => c.tareaId === tarea.codigo);
    const body = renderInformeCompletoTarea(tarea, items);
    const win = window.open('', '_blank', 'width=1100,height=900');
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tarea ' + tarea.codigo + '</title>'
        + '<style>body{margin:2rem;background:#fff;}@media print{body{margin:1rem;}}</style>'
        + '</head><body>' + body + '<script>window.onload=function(){window.print();}<\/script></body></html>');
    win.document.close();
}

function verInformeTarea(codigo) {
    switchInventarioSub('informe');
    setTimeout(() => {
        const input = document.getElementById('inf-buscar-id');
        if (input) { input.value = codigo; buscarTareaInforme(); }
    }, 80);
}

function filtrarConteosF() {
    const idTarea = (document.getElementById('cf-buscar-id')?.value || '').toLowerCase().trim();
    const usuario = (document.getElementById('cf-buscar-usuario')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('cf-tabla-body');
    if (!tbody) return;

    const conteos = (state.invConteos || []).filter(c => {
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuario || '').toLowerCase().includes(usuario)) return false;
        return true;
    });

    if (conteos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron conteos.</td></tr>`;
        return;
    }

    tbody.innerHTML = [...conteos].reverse().map((c, idx) => `
        <tr>
            <td style="text-align:center;">
                <button class="btn btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                    onclick="verDetalleConteoF(${idx})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </button>
            </td>
            <td>${c.ubicacion || '—'}</td>
            <td>${c.zona || '—'}</td>
            <td><span class="badge badge-info">${c.codigoMaterial || '—'}</span></td>
            <td>${c.descripcion || '—'}</td>
            <td>${c.loteAlmacen || '—'}</td>
            <td>${c.loteProveedor || '—'}</td>
            <td>${c.fv || '—'}</td>
            <td>
                <input type="number" min="0"
                    style="width:80px; padding:0.25rem 0.4rem; border:1px solid var(--border-subtle); border-radius:4px; font-size:0.82rem; background:var(--bg-primary); color:var(--text-primary);"
                    value="${c.cantidadContada ?? ''}"
                    onchange="actualizarCantidadConteoF(${idx}, this.value)"
                    placeholder="0">
            </td>
            <td>
                <input type="text"
                    style="width:120px; padding:0.25rem 0.4rem; border:1px solid var(--border-subtle); border-radius:4px; font-size:0.82rem; background:var(--bg-primary); color:var(--text-primary);"
                    value="${c.obs || ''}"
                    onchange="actualizarObsConteoF(${idx}, this.value)"
                    placeholder="Observación...">
            </td>
        </tr>
    `).join('');
}

let _cf_filtrados = [];

function actualizarCantidadConteoF(idx, valor) {
    const conteos = (state.invConteos || []).filter((c, i, arr) => {
        const idTarea = (document.getElementById('cf-buscar-id')?.value || '').toLowerCase().trim();
        const usuario = (document.getElementById('cf-buscar-usuario')?.value || '').toLowerCase().trim();
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuario || '').toLowerCase().includes(usuario)) return false;
        return true;
    });
    const real = [...conteos].reverse();
    if (real[idx]) real[idx].cantidadContada = parseFloat(valor) || 0;
    saveState();
}

function actualizarObsConteoF(idx, valor) {
    const conteos = (state.invConteos || []).filter(c => {
        const idTarea = (document.getElementById('cf-buscar-id')?.value || '').toLowerCase().trim();
        const usuario = (document.getElementById('cf-buscar-usuario')?.value || '').toLowerCase().trim();
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuario || '').toLowerCase().includes(usuario)) return false;
        return true;
    });
    const real = [...conteos].reverse();
    if (real[idx]) real[idx].obs = valor;
    saveState();
}

function guardarConteoF() {
    saveState();
    mostrarToast('Conteo guardado correctamente', 'emerald');
}

function verDetalleConteoF(idx) {
    // Placeholder hasta desarrollar vista de detalle de conteo
    triggerToast('notif', 'La vista de detalle de conteo estará disponible próximamente.');
}

function recargarConteosF() {
    const inputId = document.getElementById('cf-buscar-id');
    const inputUsuario = document.getElementById('cf-buscar-usuario');
    if (inputId) inputId.value = '';
    if (inputUsuario) inputUsuario.value = '';
    filtrarConteosF();
}

// ==========================================================================
//   CONCILIACIÓN
// ==========================================================================

function filtrarConciliacion() {
    const idTarea = (document.getElementById('conc-buscar-tarea')?.value || '').toLowerCase().trim();
    const usuario = (document.getElementById('conc-buscar-usuario')?.value || '').toLowerCase().trim();
    const reconteo = (document.getElementById('conc-buscar-reconteo')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('conc-tabla-body');
    if (!tbody) return;

    const items = (state.invConteos || []).filter(c => {
        if (idTarea && !(c.tareaId || '').toLowerCase().includes(idTarea)) return false;
        if (usuario && !(c.usuarioFinaliza || '').toLowerCase().includes(usuario)) return false;
        if (reconteo && !(c.asignadoReconteo || '').toLowerCase().includes(reconteo)) return false;
        return true;
    });

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron ítems para conciliar.</td></tr>`;
        return;
    }

    tbody.innerHTML = [...items].reverse().map(c => {
        const sis = parseFloat(c.cantidadSistema ?? 0);
        const fis = parseFloat(c.cantidadContada ?? 0);
        const diff = fis - sis;
        const ok = diff === 0;

        const diffColor = ok ? 'color:var(--accent-emerald,#10b981);' : 'color:var(--accent-rose,#f43f5e);';
        const rowStyle = ok ? '' : 'background:rgba(244,63,94,0.04);';
        const coincide = ok
            ? '<span style="color:var(--accent-emerald,#10b981); font-size:1.15rem; font-weight:700;">&#10003;</span>'
            : '<span style="color:var(--accent-rose,#f43f5e);   font-size:1.15rem; font-weight:700;">&#10007;</span>';

        return `
            <tr style="${rowStyle}">
                <td style="text-align:center;">
                    <button class="btn btn-secondary" style="padding:0.2rem 0.5rem; font-size:0.75rem;"
                        onclick="triggerToast('notif', 'El detalle de conciliación estará disponible próximamente.')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                    </button>
                </td>
                <td>${c.ubicacion || '—'}</td>
                <td><span class="badge badge-info">${c.codigoMaterial || '—'}</span></td>
                <td>${c.descripcion || '—'}</td>
                <td>${c.loteAlmacen || '—'}</td>
                <td>${c.loteProveedor || '—'}</td>
                <td style="text-align:right; font-weight:500;">${sis}</td>
                <td style="text-align:right; font-weight:500;">${fis}</td>
                <td style="text-align:right; font-weight:700; ${diffColor}">${diff > 0 ? '+' : ''}${diff}</td>
                <td style="text-align:center;">${coincide}</td>
                <td style="font-size:0.8rem; color:var(--text-secondary);">${c.obs || '—'}</td>
            </tr>
        `;
    }).join('');
}

function recargarConciliacion() {
    const inputTarea = document.getElementById('conc-buscar-tarea');
    const inputUsuario = document.getElementById('conc-buscar-usuario');
    const inputReconteo = document.getElementById('conc-buscar-reconteo');
    if (inputTarea) inputTarea.value = '';
    if (inputUsuario) inputUsuario.value = '';
    if (inputReconteo) inputReconteo.value = '';
    filtrarConciliacion();
}

function cerrarTareaConciliacion() {
    const idTarea = (document.getElementById('conc-buscar-tarea')?.value || '').trim();

    if (!idTarea) {
        mostrarToast('Ingresa el ID de tarea antes de cerrar', 'amber');
        return;
    }

    const items = (state.invConteos || []).filter(c => (c.tareaId || '') === idTarea);
    const conDiff = items.some(c => (c.cantidadContada ?? 0) !== (c.cantidadSistema ?? 0));

    if (conDiff) {
        mostrarToast('Existen diferencias. Genera el reconteo antes de cerrar la tarea.', 'rose');
        return;
    }

    if (!confirm(`¿Confirmas cerrar la tarea ${idTarea}? Esta acción es definitiva.`)) return;

    items.forEach(c => { c.estado = 'completado'; });

    const tarea = (state.invTareas || []).find(t => t.codigo === idTarea);
    if (tarea) tarea.estado = 'cerrada';

    saveState();
    mostrarToast(`Tarea ${idTarea} cerrada correctamente`, 'emerald');
    filtrarConciliacion();
}

function generarReconteoAuto() {
    const idTarea = (document.getElementById('conc-buscar-tarea')?.value || '').trim();

    if (!idTarea) {
        mostrarToast('Ingresa el ID de tarea para generar el reconteo', 'amber');
        return;
    }

    const tareaOrigen = (state.invTareas || []).find(t => t.codigo === idTarea);
    const itemsConDiff = (state.invConteos || []).filter(c =>
        (c.tareaId || '') === idTarea &&
        (c.cantidadContada ?? 0) !== (c.cantidadSistema ?? 0)
    );

    if (itemsConDiff.length === 0) {
        mostrarToast('No hay diferencias. La tarea puede cerrarse directamente.', 'cyan');
        return;
    }

    // Generar código único para la nueva tarea de reconteo
    const fecha = new Date();
    const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase();
    const codigoRC = `RC-${idTarea}-${sufijo}`;

    // 1. Crear nueva tarea de reconteo en invTareas
    if (!state.invTareas) state.invTareas = [];
    state.invTareas.push({
        codigo: codigoRC,
        tipo: 'Reconteo',
        zona: tareaOrigen?.zona || '',
        criterio: tareaOrigen?.criterio || '',
        asignado: tareaOrigen?.asignado || '',
        creadopor: 'Sistema',
        estado: 'pendiente',
        reconteo: idTarea,
        fecha: fecha.toLocaleDateString('es-CO'),
        obs: `Reconteo automático generado desde tarea ${idTarea}`
    });

    // 2. Crear ítems de conteo para la nueva tarea (resetear cantidad contada)
    if (!state.invConteos) state.invConteos = [];
    itemsConDiff.forEach(c => {
        state.invConteos.push({
            tareaId: codigoRC,
            ubicacion: c.ubicacion || '',
            zona: c.zona || '',
            codigoMaterial: c.codigoMaterial || '',
            descripcion: c.descripcion || '',
            loteAlmacen: c.loteAlmacen || '',
            loteProveedor: c.loteProveedor || '',
            fv: c.fv || '',
            cantidadSistema: c.cantidadSistema ?? 0,
            cantidadContada: null,
            estado: 'pendiente',
            usuario: '',
            fecha: fecha.toLocaleDateString('es-CO'),
            obs: ''
        });
        // Marcar ítem original como reconteo pendiente
        c.estado = 'reconteo pendiente';
    });

    // 3. Cambiar estado de la tarea original
    if (tareaOrigen) tareaOrigen.estado = 'reconteo pendiente';

    // 4. Registrar en invReconteos para seguimiento
    if (!state.invReconteos) state.invReconteos = [];
    state.invReconteos.push({
        id: codigoRC,
        tareaOrigen: idTarea,
        items: itemsConDiff.length,
        estado: 'abierto',
        fecha: fecha.toLocaleDateString('es-CO')
    });

    saveState();
    mostrarToast(`Reconteo ${codigoRC} creado con ${itemsConDiff.length} ítem(s)`, 'amber');
    filtrarConciliacion();
}

// ==========================================================================
//   RECONTEOS
// ==========================================================================

function filtrarReconteos() {
    const asignado = (document.getElementById('rc-buscar-asignado')?.value || '').toLowerCase().trim();
    const estado = document.getElementById('rc-filtro-estado')?.value || 'todos';
    const tbody = document.getElementById('rc-tabla-body');
    if (!tbody) return;

    const tareas = state.invTareas || [];

    let lista = (state.invReconteos || []).filter(r => {
        const tarea = tareas.find(t => t.codigo === r.id) || {};
        const asig = (tarea.asignado || r.asignado || '').toLowerCase();
        if (asignado && !asig.includes(asignado)) return false;
        if (estado !== 'todos') {
            const est = (r.estado || '').toLowerCase();
            if (estado === 'pendiente' && est !== 'abierto' && est !== 'pendiente') return false;
            if (estado !== 'pendiente' && est !== estado) return false;
        }
        return true;
    });

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron reconteos.</td></tr>`;
        return;
    }

    const estadoBadge = est => {
        const map = {
            'abierto': ['badge-warning', 'Pendiente'],
            'pendiente': ['badge-warning', 'Pendiente'],
            'en proceso': ['badge-info', 'En proceso'],
            'conciliada': ['badge-info', 'Conciliada'],
            'cerrada': ['badge-success', 'Cerrada'],
            'cerrado': ['badge-success', 'Cerrado'],
        };
        const [cls, label] = map[(est || '').toLowerCase()] || ['badge-secondary', est || '—'];
        return `<span class="badge ${cls}">${label}</span>`;
    };

    tbody.innerHTML = [...lista].reverse().map(r => {
        const tarea = tareas.find(t => t.codigo === r.id) || {};
        const itemsRC = (state.invConteos || []).filter(c => c.tareaId === r.id);
        const contados = itemsRC.filter(c => c.cantidadContada !== null && c.cantidadContada !== undefined);
        const coinciden = contados.filter(c => parseFloat(c.cantidadContada) === parseFloat(c.cantidadSistema)).length;
        const exactitud = contados.length > 0 ? `${Math.round((coinciden / contados.length) * 100)}%` : '—';

        return `
            <tr style="cursor:pointer;" onclick="seleccionarReconteo('${r.id}')"
                onmouseover="this.style.background='var(--bg-hover,rgba(255,255,255,0.04))'"
                onmouseout="this.style.background=''">
                <td><span class="badge badge-info">${r.id}</span></td>
                <td style="font-size:0.82rem; color:var(--text-secondary);">${r.tareaOrigen || '—'}</td>
                <td>${tarea.tipo || '—'}</td>
                <td>${tarea.criterio || '—'}</td>
                <td>${tarea.asignado || r.asignado || '—'}</td>
                <td>${estadoBadge(r.estado)}</td>
                <td style="text-align:center; font-weight:600; color:var(--accent-rose,#f43f5e);">${r.items ?? '—'}</td>
                <td style="text-align:center; font-weight:600;">${exactitud}</td>
            </tr>
        `;
    }).join('');
}

function seleccionarReconteo(id) {
    const panel = document.getElementById('rc-accion-body');
    if (!panel) return;

    document.querySelectorAll('#rc-tabla-body tr').forEach(tr => tr.style.background = '');
    const rowEl = [...document.querySelectorAll('#rc-tabla-body tr')]
        .find(tr => tr.querySelector('.badge')?.textContent === id);
    if (rowEl) rowEl.style.background = 'var(--bg-hover,rgba(255,255,255,0.06))';

    const r = (state.invReconteos || []).find(r => r.id === id);
    const tarea = (state.invTareas || []).find(t => t.codigo === id) || {};

    if (!r) {
        panel.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:2rem;">Reconteo no encontrado.</p>`;
        return;
    }

    const estadoBadge = est => {
        const map = {
            'abierto': ['badge-warning', 'Pendiente'],
            'pendiente': ['badge-warning', 'Pendiente'],
            'en proceso': ['badge-info', 'En proceso'],
            'conciliada': ['badge-info', 'Conciliada'],
            'cerrada': ['badge-success', 'Cerrada'],
            'cerrado': ['badge-success', 'Cerrado'],
        };
        const [cls, label] = map[(est || '').toLowerCase()] || ['badge-secondary', est || '—'];
        return `<span class="badge ${cls}">${label}</span>`;
    };

    const fila = (label, valor) => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.65rem 0; border-bottom:1px solid var(--border-subtle);">
            <span style="font-size:0.8rem; color:var(--text-secondary);">${label}</span>
            <span style="font-size:0.88rem; font-weight:500; color:var(--text-primary); text-align:right;">${valor}</span>
        </div>`;

    panel.innerHTML = `
        <div style="padding:0 0.25rem 1.25rem;">
            ${fila('ID Reconteo', `<span class="badge badge-info">${r.id}</span>`)}
            ${fila('Tarea origen', r.tareaOrigen || '—')}
            ${fila('Categoría', tarea.zona || '—')}
            ${fila('Asignado', tarea.asignado || r.asignado || '—')}
            ${fila('Estado', estadoBadge(r.estado))}
        </div>
        <div style="display:flex; flex-direction:column; gap:0.6rem; padding-top:0.25rem;">
            <button class="btn btn-primary" onclick="switchInventarioSub('conteos')" style="justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                Ir a reconteo
            </button>
            <button class="btn btn-secondary" onclick="switchInventarioSub('conciliacion')" style="justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                    <line x1="18" y1="20" x2="18" y2="10"/>
                    <line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Ver conciliación
            </button>
            <button class="btn btn-secondary" onclick="switchInventarioSub('informe')" style="justify-content:center;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                    <line x1="9" y1="11" x2="15" y2="11"/>
                </svg>
                Ver informe
            </button>
        </div>
    `;
}

function mostrarToast(msg, color) {
    const colores = {
        emerald: '#10b981',
        amber: '#f59e0b',
        rose: '#f43f5e',
        cyan: '#06b6d4'
    };
    const bg = colores[color] || colores.emerald;
    const toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;background:${bg};color:#fff;padding:0.75rem 1.25rem;border-radius:8px;font-size:0.88rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.18);`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
}

function invActualizarResumen() {
    const codigo = document.getElementById('inv-tarea-codigo')?.value || '';
    const tipo = document.getElementById('inv-tarea-tipo')?.value || '';
    const zona = document.getElementById('inv-tarea-zona')?.value || '';
    const asignado = document.getElementById('inv-tarea-asignado')?.value || '';
    const creadopor = document.getElementById('inv-tarea-creadopor')?.value || '';
    const obs = document.getElementById('inv-tarea-obs')?.value || '';

    const body = document.getElementById('inv-resumen-body');
    const badge = document.getElementById('inv-resumen-badge');
    if (!body) return;

    const tieneData = tipo || zona || asignado || creadopor;

    if (badge) {
        badge.className = tieneData ? 'badge badge-success' : 'badge badge-info';
        badge.textContent = tieneData ? 'En progreso' : 'Borrador';
    }

    if (!tieneData) {
        body.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 3rem 1rem; font-size: 0.88rem;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                    stroke-linecap="round" stroke-linejoin="round" width="40" height="40"
                    style="display: block; margin: 0 auto 1rem; opacity: 0.35;">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4"/>
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                </svg>
                Completa el formulario para ver el resumen de la tarea.
            </div>`;
        return;
    }

    const fila = (label, valor) => valor
        ? `<div style="display:flex; justify-content:space-between; align-items:flex-start; padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle);">
               <span style="font-size:0.8rem; color:var(--text-secondary); min-width: 130px;">${label}</span>
               <span style="font-size:0.88rem; color:var(--text-primary); font-weight:500; text-align:right;">${valor}</span>
           </div>`
        : '';

    body.innerHTML = `
        <div style="padding: 0 0.25rem;">
            ${fila('Código', codigo)}
            ${fila('Tipo de conteo', tipo)}
            ${fila('Zona', zona)}
            ${fila('Asignado a', asignado)}
            ${fila('Creado por', creadopor)}
            ${obs ? `<div style="margin-top: 1rem;">
                <span style="font-size:0.8rem; color:var(--text-secondary);">Observación</span>
                <p style="font-size:0.88rem; color:var(--text-primary); margin-top:0.4rem; line-height:1.5;">${obs}</p>
            </div>` : ''}
        </div>
    `;
}

function invGuardarTarea() {
    const codigo = document.getElementById('inv-tarea-codigo')?.value;
    const tipo = document.getElementById('inv-tarea-tipo')?.value;
    const zona = document.getElementById('inv-tarea-zona')?.value;
    const asignado = document.getElementById('inv-tarea-asignado')?.value;
    const creadopor = document.getElementById('inv-tarea-creadopor')?.value;
    const obs = document.getElementById('inv-tarea-obs')?.value;
    const fecha = new Date().toLocaleDateString('es-CO');

    if (!tipo || !zona || !asignado || !creadopor) {
        triggerToast('error', 'Completa Tipo de conteo, Zona, Asignado a y Creado por antes de guardar.');
        return;
    }

    if (!state.invTareas) state.invTareas = [];
    state.invTareas.push({ codigo, tipo, zona, asignado, creadopor, obs, fecha, estado: 'activa' });
    localStorage.setItem('aureo_inv_tareas', JSON.stringify(state.invTareas));

    triggerToast('success', `Tarea ${codigo} guardada correctamente.`);
    switchInventarioSub('panel');
}

function invLimpiarFormTarea() {
    ['inv-tarea-tipo', 'inv-tarea-zona', 'inv-tarea-asignado', 'inv-tarea-creadopor', 'inv-tarea-obs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    invActualizarResumen();
}

let _mcTareas = [];

function filtrarMisConteos() {
    const asignado = (document.getElementById('mc-buscar-asignado')?.value || '').toLowerCase().trim();
    const estado = document.getElementById('mc-filtro-estado')?.value || 'todos';
    const tbody = document.getElementById('mc-tabla-body');
    if (!tbody) return;

    _mcTareas = [...(state.invTareas || [])].reverse().filter(t => {
        if (estado !== 'todos' && t.estado !== estado) return false;
        if (asignado && !(t.asignado || '').toLowerCase().includes(asignado)) return false;
        return true;
    });

    if (_mcTareas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No se encontraron tareas.</td></tr>`;
        return;
    }

    const estadoBadge = e => {
        if (e === 'pendiente') return 'badge-warning';
        if (e === 'en proceso') return 'badge-success';
        if (e === 'reconteo pendiente') return 'badge-danger';
        if (e === 'conciliada') return 'badge-info';
        if (e === 'cerrada') return 'badge-secondary';
        return 'badge-info';
    };

    tbody.innerHTML = _mcTareas.map((t, idx) => `
        <tr onclick="seleccionarTareaMC(${idx})" id="mc-row-${idx}"
            style="cursor:pointer;">
            <td><span class="badge badge-info">${t.codigo || '—'}</span></td>
            <td>${t.tipo || '—'}</td>
            <td>${t.criterio || '—'}</td>
            <td>${t.asignado || '—'}</td>
            <td><span class="badge ${estadoBadge(t.estado)}">${t.estado || '—'}</span></td>
            <td>${t.reconteo || '—'}</td>
        </tr>
    `).join('');
}

function recargarMisConteos() {
    const inputAsignado = document.getElementById('mc-buscar-asignado');
    const selectEstado = document.getElementById('mc-filtro-estado');
    if (inputAsignado) inputAsignado.value = '';
    if (selectEstado) selectEstado.value = 'todos';
    _mcTareas = [];
    const panel = document.getElementById('mc-detalle-panel');
    if (panel) panel.innerHTML = `
        <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
                style="width:40px;height:40px; margin:0 auto 0.75rem; display:block; opacity:0.35;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
            </svg>
            <p style="font-size:0.85rem;">Selecciona una tarea<br>para ver el detalle</p>
        </div>`;
    filtrarMisConteos();
}

function seleccionarTareaMC(idx) {
    document.querySelectorAll('#mc-tabla-body tr').forEach(r => r.classList.remove('row-selected'));
    const row = document.getElementById(`mc-row-${idx}`);
    if (row) row.classList.add('row-selected');
    renderDetalleRapidoMC(_mcTareas[idx]);
}

function renderDetalleRapidoMC(t) {
    const panel = document.getElementById('mc-detalle-panel');
    if (!panel || !t) return;

    const estadoBadge = e => {
        if (e === 'pendiente') return 'badge-warning';
        if (e === 'en proceso') return 'badge-success';
        if (e === 'reconteo pendiente') return 'badge-danger';
        if (e === 'conciliada') return 'badge-info';
        if (e === 'cerrada') return 'badge-secondary';
        return 'badge-info';
    };

    panel.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                <span class="badge badge-info" style="font-size:0.9rem; padding:0.3rem 0.7rem;">${t.codigo || '—'}</span>
                <span class="badge ${estadoBadge(t.estado)}">${t.estado || '—'}</span>
            </div>

            <div class="kv-grid-2" style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem 0.9rem; font-size:0.82rem;">
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Tipo</div>
                    <div style="font-weight:500;">${t.tipo || '—'}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Zona</div>
                    <div style="font-weight:500;">${t.zona || '—'}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Asignado a</div>
                    <div style="font-weight:500;">${t.asignado || '—'}</div>
                </div>
                <div>
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Creado por</div>
                    <div style="font-weight:500;">${t.creadopor || '—'}</div>
                </div>
                <div style="grid-column:1/-1;">
                    <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:2px;">Fecha</div>
                    <div style="font-weight:500;">${t.fecha || '—'}</div>
                </div>
            </div>

            ${t.obs ? `
            <div style="font-size:0.81rem;">
                <div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:4px;">Observación</div>
                <div style="background:var(--bg-secondary,#f5f5f5); border-radius:6px; padding:0.6rem 0.75rem; color:var(--text-secondary); line-height:1.45;">${escapeHtml(t.obs)}</div>
            </div>` : ''}

            <div style="display:flex; flex-direction:column; gap:0.5rem; padding-top:0.5rem; border-top:1px solid var(--border-subtle);">
                <button class="btn btn-primary" style="justify-content:center; font-size:0.82rem;"
                    onclick="triggerToast('notif', 'La sección de Conteos Físicos estará disponible próximamente.');">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                    </svg>
                    Ir a conteo
                </button>
                <button class="btn btn-secondary" style="justify-content:center; font-size:0.82rem;"
                    onclick="triggerToast('notif', 'La sección de Conciliación estará disponible próximamente.');">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                    </svg>
                    Ver conciliación
                </button>
                <button class="btn btn-secondary" style="justify-content:center; font-size:0.82rem;"
                    onclick="verInformeTarea('${t.codigo}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                    </svg>
                    Ver informe
                </button>
            </div>
        </div>
    `;
}

// ==========================================================================
//   MÓDULO: INGRESO DE DATOS
// ==========================================================================

const DE_SUBS = [
    { id: 'materiales', label: 'Materiales', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
    { id: 'proveedores', label: 'Proveedores', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { id: 'ubicaciones', label: 'Ubicaciones', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>' },
    { id: 'movimientos', label: 'Movimientos', icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>' },
    { id: 'transito', label: 'En Tránsito', icon: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
    { id: 'rotulos', label: 'Historial de Rótulos', icon: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' }
];

let activeDataEntrySub = null;

function renderDataEntry() {
    const tabsEl = document.getElementById('dataentry-tabs');

    // Construir tabs si no existen aún
    if (tabsEl.children.length === 0) {
        DE_SUBS.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = 'dataentry-tab-btn';
            btn.dataset.sub = sub.id;
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${sub.icon}</svg>${sub.label}`;
            btn.onclick = () => switchDataEntrySub(sub.id);
            tabsEl.appendChild(btn);
        });
    }

    const defaultSub = activeDataEntrySub || DE_SUBS[0].id;
    switchDataEntrySub(defaultSub);
}

function switchDataEntrySub(subId) {
    activeDataEntrySub = subId;
    document.querySelectorAll('.dataentry-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sub === subId);
    });
    const renderers = {
        materiales: renderDE_Materiales,
        proveedores: renderDE_Proveedores,
        ubicaciones: renderDE_Ubicaciones,
        movimientos: renderDE_Movimientos,
        transito: renderDE_Transito,
        rotulos: renderDE_Rotulos
    };
    if (renderers[subId]) renderers[subId]();
}

// --------------------------------------------------------------------------
//   APARTADO: MATERIALES
// --------------------------------------------------------------------------
let _deMatEditId = null;
let _deMatSearch = '';
let _deMatImportRows = [];

let _deProvEditId = null;
let _deProvSearch = '';
let _deProvImportRows = [];

let _deUbicEditId = null;
let _deUbicSearch = '';
let _deUbicImportRows = [];

let _deMovEditId = null;
let _deMovFilters = { tipo: 'todos', estado: 'todos', bodega: 'todas', zona: 'todas', desde: '', hasta: '' };

function renderDE_Materiales() {
    const isEdit = _deMatEditId !== null;
    const editing = isEdit ? state.materials.find(m => m.id === _deMatEditId) : null;
    const nextId = 'MAT-' + String(state.materials.length + 1).padStart(4, '0');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            ${isEdit ? 'Editar Material' : 'Registrar Material'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_MatEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Material(event)">
          <input type="hidden" id="de-mat-edit-id" value="${isEdit ? editing.id : ''}">
          <div class="form-row" style="grid-template-columns: 140px 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">ID</label>
              <input type="text" class="form-input" id="de-mat-id"
                value="${isEdit ? editing.id : nextId}" readonly
                style="opacity:.5;cursor:not-allowed;">
            </div>
            <div class="form-group">
              <label class="form-label">Código</label>
              <input type="text" class="form-input" id="de-mat-code" required
                placeholder="Ej: COD-0045"
                value="${isEdit ? editing.code : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <input type="text" class="form-input" id="de-mat-desc" required
                placeholder="Ej: Tornillo autoperforante 1/2&quot;"
                value="${isEdit ? editing.desc : ''}">
            </div>
          </div>
          <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Unidad</label>
              <input type="number" class="form-input" id="de-mat-unit" required
                min="0" placeholder="0"
                value="${isEdit ? editing.unit : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Unidad de Medida</label>
              <select class="form-select" id="de-mat-uom">
                ${['UN', 'KG', 'MT', 'LT', 'M²', 'M³', 'CM', 'MM', 'GL', 'TON', 'GR', 'ML', 'PKT', 'JGO']
            .map(u => `<option${isEdit && editing.uom === u ? ' selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Categoría</label>
              <select class="form-select" id="de-mat-category">
                ${['Herramientas Eléctricas', 'Herramientas Manuales', 'Consumibles y EPP', 'Fijaciones y Anclajes', 'Maquinaria Pesada', 'Materiales de Construcción', 'Pinturas y Acabados', 'Eléctrico y Cableado', 'Plomería', 'Otros']
            .map(c => `<option${isEdit && editing.category === c ? ' selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:.5rem;">
            ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="cancelDE_MatEdit()">Cancelar</button>` : ''}
            <button type="submit" class="btn btn-primary">
              ${isEdit ? 'Actualizar Material' : 'Agregar Material'}
            </button>
          </div>
        </form>
      </div>

      <!-- IMPORTAR EXCEL -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Importar desde Excel
          </span>
          <button class="btn btn-secondary btn-sm" onclick="downloadDE_MatTemplate()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla
          </button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          El archivo debe tener las columnas: <strong style="color:var(--text-secondary);">Codigo · Descripcion · Unidad · UnidadMedida · Categoria</strong> (primera fila = encabezados).
        </p>
        <div class="de-import-drop" id="de-mat-dropzone" onclick="document.getElementById('de-mat-file').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="this.classList.remove('drag-over');handleDE_MatFileDrop(event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></span>
          <span style="font-size:.78rem;color:var(--text-muted);">Formatos aceptados: .xlsx · .xls · .csv</span>
          <input type="file" id="de-mat-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleDE_MatFileInput(this)">
        </div>
        <div id="de-mat-import-preview" style="margin-top:1.25rem;"></div>
      </div>

      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Materiales Registrados</span>
          <span class="badge badge-info" id="de-mat-count">${state.materials.length} registros</span>
        </div>
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-mat-search"
            placeholder="Buscar por ID, código, descripción, unidad de medida o categoría..."
            value="${_deMatSearch}"
            oninput="filterDE_Mat(this.value)">
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Unidad</th>
                <th>U. de Medida</th>
                <th>Categoría</th>
                <th style="text-align:center;">Acciones</th>
              </tr>
            </thead>
            <tbody id="de-mat-tbody">
              ${buildDE_MatRows(state.materials)}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function saveDE_Material(e) {
    e.preventDefault();
    const editId = document.getElementById('de-mat-edit-id').value;
    const mat = {
        id: editId || 'MAT-' + String(state.materials.length + 1).padStart(4, '0'),
        code: document.getElementById('de-mat-code').value.trim(),
        desc: document.getElementById('de-mat-desc').value.trim(),
        unit: document.getElementById('de-mat-unit').value,
        uom: document.getElementById('de-mat-uom').value,
        category: document.getElementById('de-mat-category').value
    };
    if (editId) {
        const idx = state.materials.findIndex(m => m.id === editId);
        if (idx !== -1) state.materials[idx] = mat;
        triggerToast('success', `Material "${mat.desc}" actualizado.`);
        _deMatEditId = null;
    } else {
        state.materials.push(mat);
        triggerToast('success', `Material "${mat.desc}" registrado.`);
    }
    saveDEKey('materials');
    renderDE_Materiales();
}

function editDE_Material(id) {
    _deMatEditId = id;
    renderDE_Materiales();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_MatEdit() {
    _deMatEditId = null;
    renderDE_Materiales();
}

function deleteDE_Material(id) {
    const mat = state.materials.find(m => m.id === id);
    if (!mat) return;
    if (!confirm(`¿Eliminar el material "${mat.desc}" (${mat.code})?`)) return;
    state.materials = state.materials.filter(m => m.id !== id);
    saveDEKey('materials');
    if (_deMatEditId === id) _deMatEditId = null;
    renderDE_Materiales();
}

function buildDE_MatRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin materiales registrados.</td></tr>`;
    }
    return list.map(m => `
        <tr>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--accent-gold);font-weight:700;">${m.id}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:600;">${m.code}</td>
          <td><span class="product-name">${m.desc}</span></td>
          <td style="text-align:center;font-weight:600;">${m.unit}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;">
            <span class="badge badge-info">${m.uom}</span>
          </td>
          <td>${m.category}</td>
          <td style="text-align:center;">
            <div style="display:inline-flex;gap:.5rem;">
              <button class="btn btn-secondary btn-icon-only" onclick="editDE_Material('${m.id}')" title="Editar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Material('${m.id}')" title="Eliminar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>`).join('');
}

function filterDE_Mat(query) {
    _deMatSearch = query.toLowerCase().trim();
    const filtered = _deMatSearch
        ? state.materials.filter(m =>
            m.id.toLowerCase().includes(_deMatSearch) ||
            m.code.toLowerCase().includes(_deMatSearch) ||
            m.desc.toLowerCase().includes(_deMatSearch) ||
            String(m.unit).toLowerCase().includes(_deMatSearch) ||
            m.uom.toLowerCase().includes(_deMatSearch) ||
            m.category.toLowerCase().includes(_deMatSearch))
        : state.materials;

    const tbody = document.getElementById('de-mat-tbody');
    const counter = document.getElementById('de-mat-count');
    if (tbody) tbody.innerHTML = buildDE_MatRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${_deMatSearch ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

// --------------------------------------------------------------------------
//   IMPORTACIÓN EXCEL — MATERIALES
// --------------------------------------------------------------------------

// Mapa flexible de nombres de columna → campo interno
const _DE_MAT_COL_MAP = {
    codigo: 'code', código: 'code', code: 'code',
    descripcion: 'desc', descripción: 'desc', description: 'desc', desc: 'desc',
    unidad: 'unit', cantidad: 'unit', qty: 'unit', quantity: 'unit',
    unidadmedida: 'uom', 'unidad de medida': 'uom', uom: 'uom', um: 'uom', 'u.m.': 'uom',
    categoria: 'category', categoría: 'category', category: 'category', cat: 'category'
};

function _normalizeHeader(h) {
    return String(h).toLowerCase().trim().replace(/\s+/g, '');
}

function _parseSheetToMaterials(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rows.length === 0) return [];

    // Mapear cabeceras del archivo a campos internos
    const headerKeys = Object.keys(rows[0]);
    const colMap = {};
    headerKeys.forEach(h => {
        const normalized = _normalizeHeader(h);
        if (_DE_MAT_COL_MAP[normalized]) colMap[h] = _DE_MAT_COL_MAP[normalized];
    });

    const required = ['code', 'desc'];
    const mapped = Object.values(colMap);
    const missing = required.filter(f => !mapped.includes(f));
    if (missing.length > 0) {
        throw new Error(`Columnas requeridas no encontradas: ${missing.join(', ')}. Verifica los encabezados del archivo.`);
    }

    return rows.map(row => {
        const obj = {};
        Object.entries(colMap).forEach(([excelCol, field]) => { obj[field] = String(row[excelCol]).trim(); });
        return obj;
    }).filter(r => r.code && r.desc);
}

function handleDE_MatFileInput(input) {
    if (!input.files.length) return;
    _readDE_MatFile(input.files[0]);
    input.value = '';
}

function handleDE_MatFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) _readDE_MatFile(file);
}

function _readDE_MatFile(file) {
    if (!_ensureXLSX()) return;
    const previewEl = document.getElementById('de-mat-import-preview');
    if (!previewEl) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        previewEl.innerHTML = `<p style="color:var(--accent-rose);font-size:.85rem;">Formato no admitido. Usa .xlsx, .xls o .csv.</p>`;
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            _deMatImportRows = _parseSheetToMaterials(wb);
            _renderDE_MatImportPreview(file.name);
        } catch (err) {
            previewEl.innerHTML = `<div class="de-import-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                ${err.message}
            </div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

function _renderDE_MatImportPreview(filename) {
    const el = document.getElementById('de-mat-import-preview');
    if (!el) return;

    if (_deMatImportRows.length === 0) {
        el.innerHTML = `<div class="de-import-error">El archivo no contiene filas válidas para importar.</div>`;
        return;
    }

    const preview = _deMatImportRows.slice(0, 5);
    const more = _deMatImportRows.length - preview.length;

    el.innerHTML = `
    <div class="de-import-preview-box">
      <div class="de-import-preview-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>${filename}</strong> — <span style="color:var(--accent-emerald);">${_deMatImportRows.length} fila(s) detectadas</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="cancelDE_MatImport()">Cancelar</button>
      </div>
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="custom-table">
          <thead><tr>
            <th>Código</th><th>Descripción</th><th>Unidad</th><th>U. de Medida</th><th>Categoría</th>
          </tr></thead>
          <tbody>
            ${preview.map(r => `
            <tr>
              <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:600;">${r.code || '—'}</td>
              <td>${r.desc || '—'}</td>
              <td style="text-align:center;">${r.unit || '—'}</td>
              <td><span class="badge badge-info">${r.uom || '—'}</span></td>
              <td>${r.category || '—'}</td>
            </tr>`).join('')}
            ${more > 0 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);font-size:.8rem;">... y ${more} fila(s) más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelDE_MatImport()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmDE_MatImport()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar importación (${_deMatImportRows.length} registros)
        </button>
      </div>
    </div>`;
}

function confirmDE_MatImport() {
    let added = 0;
    const existingCodes = new Set(state.materials.map(m => m.code.toLowerCase()));

    _deMatImportRows.forEach(row => {
        if (existingCodes.has((row.code || '').toLowerCase())) return; // evitar duplicados por código
        const nextNum = state.materials.length + added + 1;
        state.materials.push({
            id: 'MAT-' + String(nextNum).padStart(4, '0'),
            code: row.code || '',
            desc: row.desc || '',
            unit: row.unit || '0',
            uom: row.uom || 'UN',
            category: row.category || 'Otros'
        });
        existingCodes.add((row.code || '').toLowerCase());
        added++;
    });

    saveDEKey('materials');
    _deMatImportRows = [];
    triggerToast('success', `${added} material(es) importados correctamente.`);
    renderDE_Materiales();
}

function cancelDE_MatImport() {
    _deMatImportRows = [];
    const el = document.getElementById('de-mat-import-preview');
    if (el) el.innerHTML = '';
}

function downloadDE_MatTemplate() {
    if (!_ensureXLSX()) return;
    const ws = XLSX.utils.aoa_to_sheet([
        ['Codigo', 'Descripcion', 'Unidad', 'UnidadMedida', 'Categoria'],
        ['COD-0001', 'Tornillo autoperforante 1/2"', '100', 'UN', 'Fijaciones y Anclajes'],
        ['COD-0002', 'Disco de corte 4.5" metal', '50', 'UN', 'Consumibles y EPP']
    ]);
    ws['!cols'] = [{ wch: 14 }, { wch: 38 }, { wch: 10 }, { wch: 14 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
    XLSX.writeFile(wb, 'Plantilla_Materiales_Aureo.xlsx');
    triggerToast('success', 'Plantilla descargada correctamente.');
}

// --------------------------------------------------------------------------
//   APARTADO: PROVEEDORES
// --------------------------------------------------------------------------
function renderDE_Proveedores() {
    const isEdit = _deProvEditId !== null;
    const editing = isEdit ? state.suppliers.find(s => s.id === _deProvEditId) : null;
    const nextId = 'PROV-' + String(state.suppliers.length + 1).padStart(4, '0');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- FORMULARIO -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${isEdit ? 'Editar Proveedor' : 'Registrar Proveedor'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_ProvEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Proveedor(event)">
          <input type="hidden" id="de-prov-edit-id" value="${isEdit ? editing.id : ''}">
          <div class="form-row" style="grid-template-columns: 140px 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">ID</label>
              <input type="text" class="form-input" id="de-prov-id"
                value="${isEdit ? editing.id : nextId}" readonly
                style="opacity:.5;cursor:not-allowed;">
            </div>
            <div class="form-group">
              <label class="form-label">Proveedor</label>
              <input type="text" class="form-input" id="de-prov-name" required
                placeholder="Ej: Ferrox Andina Ltda."
                value="${isEdit ? editing.name : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Acreedor <span style="font-size:.78rem;color:var(--text-muted);">(código del proveedor)</span></label>
              <input type="text" class="form-input" id="de-prov-acreedor" required
                placeholder="Ej: ACR-0012"
                value="${isEdit ? editing.acreedor : ''}">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:.5rem;">
            ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="cancelDE_ProvEdit()">Cancelar</button>` : ''}
            <button type="submit" class="btn btn-primary">
              ${isEdit ? 'Actualizar Proveedor' : 'Agregar Proveedor'}
            </button>
          </div>
        </form>
      </div>

      <!-- IMPORTAR EXCEL -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Importar desde Excel
          </span>
          <button class="btn btn-secondary btn-sm" onclick="downloadDE_ProvTemplate()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla
          </button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          El archivo debe tener las columnas: <strong style="color:var(--text-secondary);">Proveedor · Acreedor</strong> (primera fila = encabezados).
        </p>
        <div class="de-import-drop" id="de-prov-dropzone" onclick="document.getElementById('de-prov-file').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="this.classList.remove('drag-over');handleDE_ProvFileDrop(event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></span>
          <span style="font-size:.78rem;color:var(--text-muted);">Formatos aceptados: .xlsx · .xls · .csv</span>
          <input type="file" id="de-prov-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleDE_ProvFileInput(this)">
        </div>
        <div id="de-prov-import-preview" style="margin-top:1.25rem;"></div>
      </div>

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Proveedores Registrados</span>
          <span class="badge badge-info" id="de-prov-count">${state.suppliers.length} registros</span>
        </div>
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-prov-search"
            placeholder="Buscar por ID, proveedor o acreedor..."
            value="${_deProvSearch}"
            oninput="filterDE_Prov(this.value)">
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>ID</th>
              <th>Proveedor</th>
              <th>Acreedor</th>
              <th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody id="de-prov-tbody">
              ${buildDE_ProvRows(state.suppliers)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function buildDE_ProvRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin proveedores registrados.</td></tr>`;
    }
    return list.map(s => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--accent-gold);font-weight:700;">${s.id}</td>
      <td><span class="product-name">${s.name}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.85rem;font-weight:600;">${s.acreedor || '—'}</td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:.5rem;">
          <button class="btn btn-secondary btn-icon-only" onclick="editDE_Proveedor('${s.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Proveedor('${s.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function filterDE_Prov(query) {
    _deProvSearch = query.toLowerCase().trim();
    const filtered = _deProvSearch
        ? state.suppliers.filter(s =>
            (s.id || '').toLowerCase().includes(_deProvSearch) ||
            (s.name || '').toLowerCase().includes(_deProvSearch) ||
            (s.acreedor || '').toLowerCase().includes(_deProvSearch))
        : state.suppliers;

    const tbody = document.getElementById('de-prov-tbody');
    const counter = document.getElementById('de-prov-count');
    if (tbody) tbody.innerHTML = buildDE_ProvRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${_deProvSearch ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

function saveDE_Proveedor(e) {
    e.preventDefault();
    const editId = document.getElementById('de-prov-edit-id').value;
    const prov = {
        id: editId || 'PROV-' + String(state.suppliers.length + 1).padStart(4, '0'),
        name: document.getElementById('de-prov-name').value.trim(),
        acreedor: document.getElementById('de-prov-acreedor').value.trim()
    };
    if (editId) {
        const idx = state.suppliers.findIndex(s => s.id === editId);
        if (idx !== -1) state.suppliers[idx] = prov;
        triggerToast('success', `Proveedor "${escapeHtml(prov.name)}" actualizado.`);
        _deProvEditId = null;
    } else {
        state.suppliers.push(prov);
        triggerToast('success', `Proveedor "${escapeHtml(prov.name)}" registrado.`);
    }
    saveDEKey('suppliers');
    renderDE_Proveedores();
}

function editDE_Proveedor(id) {
    _deProvEditId = id;
    renderDE_Proveedores();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_ProvEdit() {
    _deProvEditId = null;
    renderDE_Proveedores();
}

function deleteDE_Proveedor(id) {
    const s = state.suppliers.find(s => s.id === id);
    if (!s) return;
    if (!confirm(`¿Eliminar proveedor "${s.name}" (${s.acreedor})?`)) return;
    state.suppliers = state.suppliers.filter(s => s.id !== id);
    saveDEKey('suppliers');
    if (_deProvEditId === id) _deProvEditId = null;
    renderDE_Proveedores();
}

// --- Importación Excel Proveedores ---
const _DE_PROV_COL_MAP = {
    proveedor: 'name', provider: 'name', nombre: 'name', name: 'name',
    acreedor: 'acreedor', creditor: 'acreedor', codigo: 'acreedor', code: 'acreedor'
};

function handleDE_ProvFileInput(input) {
    if (!input.files.length) return;
    _readDE_ProvFile(input.files[0]);
    input.value = '';
}

function handleDE_ProvFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) _readDE_ProvFile(file);
}

function _readDE_ProvFile(file) {
    if (!_ensureXLSX()) return;
    const previewEl = document.getElementById('de-prov-import-preview');
    if (!previewEl) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        previewEl.innerHTML = `<div class="de-import-error">Formato no admitido. Usa .xlsx, .xls o .csv.</div>`;
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (rows.length === 0) throw new Error('El archivo no contiene filas con datos.');

            const colMap = {};
            Object.keys(rows[0]).forEach(h => {
                const n = h.toLowerCase().trim().replace(/\s+/g, '');
                if (_DE_PROV_COL_MAP[n]) colMap[h] = _DE_PROV_COL_MAP[n];
            });
            if (!Object.values(colMap).includes('name')) {
                throw new Error('Columna "Proveedor" no encontrada. Verifica los encabezados.');
            }

            _deProvImportRows = rows.map(row => {
                const obj = {};
                Object.entries(colMap).forEach(([col, field]) => { obj[field] = String(row[col]).trim(); });
                return obj;
            }).filter(r => r.name);

            _renderDE_ProvImportPreview(file.name);
        } catch (err) {
            previewEl.innerHTML = `<div class="de-import-error">${err.message}</div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

function _renderDE_ProvImportPreview(filename) {
    const el = document.getElementById('de-prov-import-preview');
    if (!el || _deProvImportRows.length === 0) return;
    const preview = _deProvImportRows.slice(0, 5);
    const more = _deProvImportRows.length - preview.length;
    el.innerHTML = `
    <div class="de-import-preview-box">
      <div class="de-import-preview-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>${filename}</strong> — <span style="color:var(--accent-emerald);">${_deProvImportRows.length} fila(s) detectadas</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="cancelDE_ProvImport()">Cancelar</button>
      </div>
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="custom-table">
          <thead><tr><th>Proveedor</th><th>Acreedor</th></tr></thead>
          <tbody>
            ${preview.map(r => `
            <tr>
              <td>${r.name || '—'}</td>
              <td style="font-family:'JetBrains Mono',monospace;font-size:.82rem;font-weight:600;">${r.acreedor || '—'}</td>
            </tr>`).join('')}
            ${more > 0 ? `<tr><td colspan="2" style="text-align:center;color:var(--text-muted);font-size:.8rem;">... y ${more} fila(s) más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelDE_ProvImport()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmDE_ProvImport()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar importación (${_deProvImportRows.length} registros)
        </button>
      </div>
    </div>`;
}

function confirmDE_ProvImport() {
    let added = 0;
    const existingAcreedores = new Set(state.suppliers.map(s => (s.acreedor || '').toLowerCase()));
    _deProvImportRows.forEach((row, i) => {
        const acr = (row.acreedor || '').toLowerCase();
        if (acr && existingAcreedores.has(acr)) return;
        const nextNum = state.suppliers.length + added + 1;
        state.suppliers.push({
            id: 'PROV-' + String(nextNum).padStart(4, '0'),
            name: row.name || '',
            acreedor: row.acreedor || ''
        });
        if (acr) existingAcreedores.add(acr);
        added++;
    });
    saveDEKey('suppliers');
    _deProvImportRows = [];
    triggerToast('success', `${added} proveedor(es) importados correctamente.`);
    renderDE_Proveedores();
}

function cancelDE_ProvImport() {
    _deProvImportRows = [];
    const el = document.getElementById('de-prov-import-preview');
    if (el) el.innerHTML = '';
}

function downloadDE_ProvTemplate() {
    if (!_ensureXLSX()) return;
    const ws = XLSX.utils.aoa_to_sheet([
        ['Proveedor', 'Acreedor'],
        ['Ferrox Andina Ltda.', 'ACR-0001'],
        ['TitanPro Abrasivos S.A.', 'ACR-0002']
    ]);
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Proveedores');
    XLSX.writeFile(wb, 'Plantilla_Proveedores_Aureo.xlsx');
    triggerToast('success', 'Plantilla descargada correctamente.');
}

// --------------------------------------------------------------------------
//   APARTADO: UBICACIONES
// --------------------------------------------------------------------------
function _calcUbicFinal(base, position) {
    const b = String(base || '').trim();
    const p = String(position || '').trim();
    if (!b) return '';
    return p ? `${b}-${p}` : b;
}

function renderDE_Ubicaciones() {
    const isEdit = _deUbicEditId !== null;
    const editing = isEdit ? state.locations.find(l => l.id === _deUbicEditId) : null;
    const nextId = 'UBIC-' + String(state.locations.length + 1).padStart(4, '0');

    const v = (field, fallback = '') => isEdit ? (editing[field] ?? fallback) : fallback;

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- FORMULARIO -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
            ${isEdit ? 'Editar Ubicación' : 'Registrar Ubicación'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_UbicEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Ubicacion(event)">
          <input type="hidden" id="de-loc-edit-id" value="${isEdit ? editing.id : ''}">
          <div class="form-row" style="grid-template-columns: 1fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Ubicación Base <span style="font-size:.75rem;color:var(--text-muted);">(centenas)</span></label>
              <input type="number" class="form-input" id="de-loc-base" required
                min="100" step="100" placeholder="100"
                value="${v('base', '')}"
                oninput="updateDE_UbicFinal()">
            </div>
            <div class="form-group">
              <label class="form-label">Posición <span style="font-size:.75rem;color:var(--text-muted);">— por determinar</span></label>
              <input type="text" class="form-input" id="de-loc-position"
                placeholder="Por determinar"
                value="${v('position', '')}"
                oninput="updateDE_UbicFinal()">
            </div>
            <div class="form-group">
              <label class="form-label">Ubicación Final <span style="font-size:.75rem;color:var(--text-muted);">(auto)</span></label>
              <input type="text" class="form-input" id="de-loc-final"
                value="${isEdit ? _calcUbicFinal(editing.base, editing.position) : ''}" readonly
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">
            </div>
          </div>
          <div class="form-row" style="grid-template-columns: 1fr 1fr auto;">
            <div class="form-group">
              <label class="form-label">Zona <span style="font-size:.75rem;color:var(--text-muted);">(= Ubicación Base)</span></label>
              <input type="text" class="form-input" id="de-loc-zona"
                value="${isEdit ? (editing.base || '') : ''}" readonly
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;">
            </div>
            <div class="form-group">
              <label class="form-label">Zona Bodega</label>
              <select class="form-select" id="de-loc-warehouse">
                <option value="Bodegas Externas" ${v('warehouse') === 'Bodegas Externas' || !isEdit ? 'selected' : ''}>Bodegas Externas</option>
                <option value="Bodegas Internas" ${v('warehouse') === 'Bodegas Internas' ? 'selected' : ''}>Bodegas Internas</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <div style="display:flex;gap:.75rem;">
                ${isEdit ? `<button type="button" class="btn btn-secondary" onclick="cancelDE_UbicEdit()">Cancelar</button>` : ''}
                <button type="submit" class="btn btn-primary">
                  ${isEdit ? 'Actualizar' : 'Agregar Ubicación'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- IMPORTAR EXCEL -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Importar desde Excel
          </span>
          <button class="btn btn-secondary btn-sm" onclick="downloadDE_UbicTemplate()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Descargar plantilla
          </button>
        </div>
        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          El archivo debe tener las columnas: <strong style="color:var(--text-secondary);">Ubicacion · Posiciones · Zona · Bodega</strong> (primera fila = encabezados).
        </p>
        <div class="de-import-drop" onclick="document.getElementById('de-ubic-file').click()"
          ondragover="event.preventDefault();this.classList.add('drag-over')"
          ondragleave="this.classList.remove('drag-over')"
          ondrop="this.classList.remove('drag-over');handleDE_UbicFileDrop(event)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>Arrastra tu archivo aquí o <strong>haz clic para seleccionar</strong></span>
          <span style="font-size:.78rem;color:var(--text-muted);">Formatos aceptados: .xlsx · .xls · .csv</span>
          <input type="file" id="de-ubic-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="handleDE_UbicFileInput(this)">
        </div>
        <div id="de-ubic-import-preview" style="margin-top:1.25rem;"></div>
      </div>

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Ubicaciones Registradas</span>
          <span class="badge badge-info" id="de-ubic-count">${state.locations.length} registros</span>
        </div>
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-ubic-search"
            placeholder="Buscar por ID, código, bodega, pasillo o categoría..."
            value="${_deUbicSearch}"
            oninput="filterDE_Ubic(this.value)">
        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Ubicación Base</th>
              <th>Posición</th>
              <th>Ubicación Final</th>
              <th>Zona</th>
              <th>Zona Bodega</th>
              <th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody id="de-ubic-tbody">
              ${buildDE_UbicRows(state.locations)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function buildDE_UbicRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin ubicaciones registradas.</td></tr>`;
    }
    return list.map(l => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.9rem;font-weight:700;text-align:center;">${l.base}</td>
      <td style="color:var(--text-muted);font-style:italic;">${l.position || 'Por determinar'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">${l.final || l.base}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.9rem;text-align:center;">${l.base}</td>
      <td><span class="badge ${l.warehouse === 'Bodegas Externas' ? 'badge-info' : 'badge-success'}">${l.warehouse}</span></td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:.5rem;">
          <button class="btn btn-secondary btn-icon-only" onclick="editDE_Ubicacion('${l.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Ubicacion('${l.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function updateDE_UbicFinal() {
    const base = document.getElementById('de-loc-base')?.value || '';
    const position = document.getElementById('de-loc-position')?.value || '';
    const final = _calcUbicFinal(base, position);
    const finalEl = document.getElementById('de-loc-final');
    const zonaEl = document.getElementById('de-loc-zona');
    if (finalEl) finalEl.value = final;
    if (zonaEl) zonaEl.value = base;
}

function filterDE_Ubic(query) {
    _deUbicSearch = query.toLowerCase().trim();
    const filtered = _deUbicSearch
        ? state.locations.filter(l =>
            (l.id || '').toLowerCase().includes(_deUbicSearch) ||
            String(l.base || '').includes(_deUbicSearch) ||
            (l.position || '').toLowerCase().includes(_deUbicSearch) ||
            (l.final || '').toLowerCase().includes(_deUbicSearch) ||
            (l.warehouse || '').toLowerCase().includes(_deUbicSearch))
        : state.locations;

    const tbody = document.getElementById('de-ubic-tbody');
    const counter = document.getElementById('de-ubic-count');
    if (tbody) tbody.innerHTML = buildDE_UbicRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${_deUbicSearch ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

function saveDE_Ubicacion(e) {
    e.preventDefault();
    const editId = document.getElementById('de-loc-edit-id').value;
    const base = parseInt(document.getElementById('de-loc-base').value) || 0;
    const position = document.getElementById('de-loc-position').value.trim();
    const loc = {
        id: editId || 'UBIC-' + String(state.locations.length + 1).padStart(4, '0'),
        base,
        position,
        final: _calcUbicFinal(base, position),
        warehouse: document.getElementById('de-loc-warehouse').value
    };
    if (editId) {
        const idx = state.locations.findIndex(l => l.id === editId);
        if (idx !== -1) state.locations[idx] = loc;
        triggerToast('success', `Ubicación "${loc.final}" actualizada.`);
        _deUbicEditId = null;
    } else {
        state.locations.push(loc);
        triggerToast('success', `Ubicación "${loc.final}" registrada.`);
    }
    saveDEKey('locations');
    renderDE_Ubicaciones();
}

function editDE_Ubicacion(id) {
    _deUbicEditId = id;
    renderDE_Ubicaciones();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_UbicEdit() {
    _deUbicEditId = null;
    renderDE_Ubicaciones();
}

function deleteDE_Ubicacion(id) {
    const l = state.locations.find(l => l.id === id);
    if (!l) return;
    if (!confirm(`¿Eliminar ubicación "${l.code}"?`)) return;
    state.locations = state.locations.filter(l => l.id !== id);
    saveDEKey('locations');
    if (_deUbicEditId === id) _deUbicEditId = null;
    renderDE_Ubicaciones();
}

// --- Importación Excel Ubicaciones ---
const _DE_UBIC_COL_MAP = {
    ubicacion: 'base', ubicación: 'base', base: 'base',
    posiciones: 'position', posicion: 'position', posición: 'position', position: 'position',
    zona: 'zona',
    bodega: 'warehouse', warehouse: 'warehouse'
};

function handleDE_UbicFileInput(input) {
    if (!input.files.length) return;
    _readDE_UbicFile(input.files[0]);
    input.value = '';
}

function handleDE_UbicFileDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) _readDE_UbicFile(file);
}

function _readDE_UbicFile(file) {
    if (!_ensureXLSX()) return;
    const previewEl = document.getElementById('de-ubic-import-preview');
    if (!previewEl) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        previewEl.innerHTML = `<div class="de-import-error">Formato no admitido. Usa .xlsx, .xls o .csv.</div>`;
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (rows.length === 0) throw new Error('El archivo no contiene filas con datos.');

            const colMap = {};
            Object.keys(rows[0]).forEach(h => {
                const n = h.toLowerCase().trim().replace(/\s+/g, '');
                if (_DE_UBIC_COL_MAP[n]) colMap[h] = _DE_UBIC_COL_MAP[n];
            });
            if (!Object.values(colMap).includes('base')) {
                throw new Error('Columna "Ubicacion" no encontrada. Verifica los encabezados.');
            }

            _deUbicImportRows = rows.map(row => {
                const obj = {};
                Object.entries(colMap).forEach(([col, field]) => { obj[field] = String(row[col]).trim(); });
                // Calcular ubicación final uniendo base + posición
                obj.final = _calcUbicFinal(obj.base, obj.position);
                return obj;
            }).filter(r => r.base);

            _renderDE_UbicImportPreview(file.name);
        } catch (err) {
            previewEl.innerHTML = `<div class="de-import-error">${err.message}</div>`;
        }
    };
    reader.readAsArrayBuffer(file);
}

function _renderDE_UbicImportPreview(filename) {
    const el = document.getElementById('de-ubic-import-preview');
    if (!el || _deUbicImportRows.length === 0) return;
    const preview = _deUbicImportRows.slice(0, 5);
    const more = _deUbicImportRows.length - preview.length;
    el.innerHTML = `
    <div class="de-import-preview-box">
      <div class="de-import-preview-header">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
          <strong>${filename}</strong> — <span style="color:var(--accent-emerald);">${_deUbicImportRows.length} fila(s) detectadas</span>
        </span>
        <button class="btn btn-secondary btn-sm" onclick="cancelDE_UbicImport()">Cancelar</button>
      </div>
      <div class="table-responsive" style="margin-top:.75rem;">
        <table class="custom-table">
          <thead><tr><th>Ubicacion</th><th>Posiciones</th><th>Zona</th><th>Bodega</th></tr></thead>
          <tbody>
            ${preview.map(r => `
            <tr>
              <td style="font-family:'JetBrains Mono',monospace;font-weight:700;text-align:center;">${r.base || '—'}</td>
              <td style="color:var(--text-muted);font-style:italic;">${r.position || 'Por determinar'}</td>
              <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">${r.final || r.base || '—'}</td>
              <td><span class="badge ${r.warehouse === 'Bodegas Externas' ? 'badge-info' : 'badge-success'}">${r.warehouse || '—'}</span></td>
            </tr>`).join('')}
            ${more > 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);font-size:.8rem;">... y ${more} fila(s) más</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:.75rem;margin-top:1rem;">
        <button class="btn btn-secondary" onclick="cancelDE_UbicImport()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmDE_UbicImport()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;"><polyline points="20 6 9 17 4 12"/></svg>
          Confirmar importación (${_deUbicImportRows.length} registros)
        </button>
      </div>
    </div>`;
}

function confirmDE_UbicImport() {
    let added = 0;
    const existingFinals = new Set(state.locations.map(l => (l.final || '').toLowerCase()));
    _deUbicImportRows.forEach(row => {
        const final = (row.final || '').toLowerCase();
        if (final && existingFinals.has(final)) return;
        const nextNum = state.locations.length + added + 1;
        const base = parseInt(row.base) || 0;
        state.locations.push({
            id: 'UBIC-' + String(nextNum).padStart(4, '0'),
            base,
            position: row.position || '',
            final: row.final || _calcUbicFinal(base, row.position),
            warehouse: row.warehouse || 'Bodegas Externas'
        });
        if (final) existingFinals.add(final);
        added++;
    });
    saveDEKey('locations');
    _deUbicImportRows = [];
    triggerToast('success', `${added} ubicación(es) importadas correctamente.`);
    renderDE_Ubicaciones();
}

function cancelDE_UbicImport() {
    _deUbicImportRows = [];
    const el = document.getElementById('de-ubic-import-preview');
    if (el) el.innerHTML = '';
}

function downloadDE_UbicTemplate() {
    if (!_ensureXLSX()) return;
    const ws = XLSX.utils.aoa_to_sheet([
        ['Ubicacion', 'Posiciones', 'Zona', 'Bodega'],
        ['100', 'A', '100', 'Bodegas Externas'],
        ['200', 'B', '200', 'Bodegas Internas'],
        ['300', '', '300', 'Bodegas Externas']
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ubicaciones');
    XLSX.writeFile(wb, 'Plantilla_Ubicaciones_Aureo.xlsx');
    triggerToast('success', 'Plantilla descargada correctamente.');
}

// --------------------------------------------------------------------------
//   APARTADO: MOVIMIENTOS
// --------------------------------------------------------------------------
function _nowDatetimeLocal() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderDE_Movimientos() {
    const isEdit = _deMovEditId !== null;
    const editing = isEdit ? state.movements.find(m => m.id === _deMovEditId) : null;
    const v = (f, fb = '') => isEdit ? (editing[f] ?? fb) : fb;

    const matOptions = state.materials.map(m =>
        `<option value="${m.id}" ${isEdit && editing.materialId === m.id ? 'selected' : ''}>${m.id} — ${m.desc}</option>`
    ).join('');

    const ubicOptions = [...new Set(state.locations.map(l => l.base))].sort((a, b) => a - b).map(b =>
        `<option value="${b}" ${isEdit && String(editing.ubicBase) === String(b) ? 'selected' : ''}>${b}</option>`
    ).join('');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- FORMULARIO -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            ${isEdit ? 'Editar Movimiento' : 'Registrar Movimiento'}
          </span>
          ${isEdit ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cancelDE_MovEdit()">Cancelar edición</button>` : ''}
        </div>
        <form onsubmit="saveDE_Movimiento(event)">
          <input type="hidden" id="de-mov-edit-id" value="${isEdit ? editing.id : ''}">

          <!-- Fila 1: Fecha/hora · Tipo · Estado -->
          <div class="form-row" style="grid-template-columns:1.4fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Fecha y Hora</label>
              <input type="datetime-local" class="form-input" id="de-mov-datetime" required value="${v('datetime', _nowDatetimeLocal())}">
            </div>
            <div class="form-group">
              <label class="form-label">Tipo</label>
              <select class="form-select" id="de-mov-type">
                <option value="Entrada" ${v('type') === 'Entrada' || !isEdit ? 'selected' : ''}>Entrada</option>
                <option value="Salida"  ${v('type') === 'Salida' ? 'selected' : ''}>Salida</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Estado</label>
              <select class="form-select" id="de-mov-status">
                <option value="Almacenado"  ${v('status', 'Almacenado') === 'Almacenado' ? 'selected' : ''}>Almacenado</option>
                <option value="En Tránsito" ${v('status') === 'En Tránsito' ? 'selected' : ''}>En Tránsito</option>
              </select>
            </div>
          </div>

          <!-- Fila 2: Usuario · Documento -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Usuario</label>
              <input type="text" class="form-input" id="de-mov-user" placeholder="Ej: jperez" value="${v('user')}">
            </div>
            <div class="form-group">
              <label class="form-label">Documento</label>
              <input type="text" class="form-input" id="de-mov-doc" placeholder="Ej: OC-2026-0045" value="${v('doc')}">
            </div>
          </div>

          <!-- Fila 3: Material ID · Descripción · UM · Categoría -->
          <div class="form-row" style="grid-template-columns:1fr 1.5fr 0.6fr 1fr;">
            <div class="form-group">
              <label class="form-label">Material (ID)</label>
              <select class="form-select" id="de-mov-material" onchange="autoFillDE_MovMaterial()">
                <option value="">— Seleccionar —</option>
                ${matOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Descripción</label>
              <input type="text" class="form-input" id="de-mov-desc" placeholder="Se llena al seleccionar material" value="${v('desc')}">
            </div>
            <div class="form-group">
              <label class="form-label">UM</label>
              <input type="text" class="form-input" id="de-mov-um" placeholder="UN" value="${v('um')}">
            </div>
            <div class="form-group">
              <label class="form-label">Categoría</label>
              <input type="text" class="form-input" id="de-mov-category" placeholder="Se llena automático" value="${v('category')}">
            </div>
          </div>

          <!-- Fila 4: Ubic. Base · Posición · Ubic. Final · Zona -->
          <div class="form-row" style="grid-template-columns:0.8fr 0.8fr 1fr 0.8fr;">
            <div class="form-group">
              <label class="form-label">Ubicación Base</label>
              <select class="form-select" id="de-mov-ubic-base" onchange="updateDE_MovUbicFinal()">
                <option value="">— Seleccionar —</option>
                ${ubicOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Posición</label>
              <input type="text" class="form-input" id="de-mov-position" placeholder="Por determinar" value="${v('position')}" oninput="updateDE_MovUbicFinal()">
            </div>
            <div class="form-group">
              <label class="form-label">Ubicación Final <span style="font-size:.75rem;color:var(--text-muted);">(auto)</span></label>
              <input type="text" class="form-input" id="de-mov-ubic-final" readonly
                value="${isEdit ? _calcUbicFinal(editing.ubicBase, editing.position) : ''}"
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;font-weight:700;">
            </div>
            <div class="form-group">
              <label class="form-label">Zona <span style="font-size:.75rem;color:var(--text-muted);">(auto)</span></label>
              <input type="text" class="form-input" id="de-mov-zona" readonly
                value="${isEdit ? (editing.ubicBase || '') : ''}"
                style="opacity:.6;cursor:not-allowed;font-family:'JetBrains Mono',monospace;">
            </div>
          </div>

          <!-- Fila 5: Bodega · Lote Almacén · Lote Proveedor -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Bodega</label>
              <select class="form-select" id="de-mov-bodega">
                <option value="Bodegas Externas" ${v('bodega', 'Bodegas Externas') === 'Bodegas Externas' ? 'selected' : ''}>Bodegas Externas</option>
                <option value="Bodegas Internas" ${v('bodega') === 'Bodegas Internas' ? 'selected' : ''}>Bodegas Internas</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Lote Almacén</label>
              <input type="text" class="form-input" id="de-mov-lot-alm" placeholder="Ej: LA-0023" value="${v('lotAlm')}">
            </div>
            <div class="form-group">
              <label class="form-label">Lote Proveedor</label>
              <input type="text" class="form-input" id="de-mov-lot-prov" placeholder="Ej: LP-9912" value="${v('lotProv')}">
            </div>
          </div>

          <!-- Fila 6: Vencimiento · Cantidad -->
          <div class="form-row" style="grid-template-columns:1fr 1fr 1fr;">
            <div class="form-group">
              <label class="form-label">Vencimiento</label>
              <input type="date" class="form-input" id="de-mov-expiry" value="${v('expiry')}">
            </div>
            <div class="form-group">
              <label class="form-label">Cantidad</label>
              <input type="number" class="form-input" id="de-mov-qty" required min="1" placeholder="0" value="${v('qty')}">
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <div style="display:flex;gap:.75rem;width:100%;">
                ${isEdit ? `<button type="button" class="btn btn-secondary" style="flex:1;" onclick="cancelDE_MovEdit()">Cancelar</button>` : ''}
                <button type="submit" class="btn btn-primary" style="flex:1;">
                  ${isEdit ? 'Actualizar' : 'Registrar Movimiento'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Movimientos Registrados</span>
          <span class="badge badge-info" id="de-mov-count">${state.movements.length} registros</span>
        </div>

        <!-- BÚSQUEDA MANUAL -->
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-mov-search"
            placeholder="Buscar por usuario, documento, material, descripción, lote..."
            oninput="applyDE_MovFilters()">
        </div>

        <!-- BARRA DE FILTROS -->
        <div class="de-mov-filterbar">

          <!-- Tipo -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Tipo</span>
            <div class="de-filter-pills" data-group="tipo">
              ${['todos', 'Entrada', 'Salida', 'Stock'].map(v => `
              <button class="de-filter-pill ${_deMovFilters.tipo === v ? 'active' : ''}"
                data-value="${v}" onclick="setDE_MovFilter('tipo','${v}')">
                ${v === 'todos' ? 'Todos' : v}
              </button>`).join('')}
            </div>
          </div>

          <!-- Estado -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Estado</span>
            <div class="de-filter-pills" data-group="estado">
              ${['todos', 'Almacenado', 'En Tránsito'].map(v => `
              <button class="de-filter-pill ${_deMovFilters.estado === v ? 'active' : ''}"
                data-value="${v}" onclick="setDE_MovFilter('estado','${v}')">
                ${v === 'todos' ? 'Todos' : v}
              </button>`).join('')}
            </div>
          </div>

          <!-- Bodega -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Bodega</span>
            <select class="form-select de-mov-filter-select" onchange="setDE_MovFilter('bodega',this.value)">
              <option value="todas"  ${_deMovFilters.bodega === 'todas' ? 'selected' : ''}>Todas las Bodegas</option>
              <option value="Bodegas Externas" ${_deMovFilters.bodega === 'Bodegas Externas' ? 'selected' : ''}>Bodegas Externas</option>
              <option value="Bodegas Internas" ${_deMovFilters.bodega === 'Bodegas Internas' ? 'selected' : ''}>Bodegas Internas</option>
            </select>
          </div>

          <!-- Zona -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Zona</span>
            <select class="form-select de-mov-filter-select" onchange="setDE_MovFilter('zona',this.value)">
              <option value="todas" ${_deMovFilters.zona === 'todas' ? 'selected' : ''}>Todas las Zonas</option>
              ${[...new Set([
        ...state.locations.map(l => String(l.base)),
        ...state.movements.map(m => String(m.ubicBase || '')).filter(Boolean)
    ])].sort((a, b) => Number(a) - Number(b)).map(z =>
        `<option value="${z}" ${_deMovFilters.zona === z ? 'selected' : ''}>${z}</option>`
    ).join('')}
            </select>
          </div>

          <!-- Rango de Fechas -->
          <div class="de-mov-filter-group">
            <span class="de-mov-filter-label">Rango de Fechas</span>
            <div style="display:flex;align-items:center;gap:.5rem;">
              <div>
                <span style="font-size:.75rem;color:var(--text-muted);display:block;margin-bottom:.2rem;">Fecha desde</span>
                <input type="date" class="form-input de-mov-filter-date" id="de-mov-filter-desde"
                  value="${_deMovFilters.desde}" oninput="setDE_MovFilter('desde',this.value)">
              </div>
              <span style="color:var(--text-muted);margin-top:1.1rem;">→</span>
              <div>
                <span style="font-size:.75rem;color:var(--text-muted);display:block;margin-bottom:.2rem;">Fecha hasta</span>
                <input type="date" class="form-input de-mov-filter-date" id="de-mov-filter-hasta"
                  value="${_deMovFilters.hasta}" oninput="setDE_MovFilter('hasta',this.value)">
              </div>
              ${(_deMovFilters.desde || _deMovFilters.hasta) ? `
              <button class="btn btn-secondary btn-sm" style="margin-top:1.1rem;" onclick="clearDE_MovDates()">✕</button>` : ''}
            </div>
          </div>

        </div>
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Fecha / Hora</th><th>Tipo</th><th>Estado</th><th>Usuario</th><th>Documento</th>
              <th>Material ID</th><th>Descripción</th><th>UM</th><th>Categoría</th>
              <th>Ubic. Base</th><th>Posición</th><th>Ubic. Final</th><th>Zona</th><th>Bodega</th>
              <th>Lote Alm.</th><th>Lote Prov.</th><th>Vencimiento</th><th style="text-align:center;">Cant.</th>
              <th style="text-align:center;">Acciones</th>
            </tr></thead>
            <tbody id="de-mov-tbody">
              ${buildDE_MovRows(state.movements)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function autoFillDE_MovMaterial() {
    const id = document.getElementById('de-mov-material')?.value;
    const mat = state.materials.find(m => m.id === id);
    if (!mat) return;
    const descEl = document.getElementById('de-mov-desc');
    const umEl = document.getElementById('de-mov-um');
    const catEl = document.getElementById('de-mov-category');
    if (descEl) descEl.value = mat.desc || '';
    if (umEl) umEl.value = mat.uom || '';
    if (catEl) catEl.value = mat.category || '';
}

function updateDE_MovUbicFinal() {
    const base = document.getElementById('de-mov-ubic-base')?.value || '';
    const pos = document.getElementById('de-mov-position')?.value || '';
    const finalEl = document.getElementById('de-mov-ubic-final');
    const zonaEl = document.getElementById('de-mov-zona');
    if (finalEl) finalEl.value = _calcUbicFinal(base, pos);
    if (zonaEl) zonaEl.value = base;
}

function buildDE_MovRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="19" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin movimientos registrados.</td></tr>`;
    }
    const typeBadge = { 'Entrada': 'badge-success', 'Salida': 'badge-danger' };
    const statBadge = { 'Almacenado': 'badge-info', 'En Tránsito': 'badge-warning' };
    return [...list].reverse().map(m => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;white-space:nowrap;">${(m.datetime || '').replace('T', ' ')}</td>
      <td><span class="badge ${typeBadge[m.type] || 'badge-info'}">${m.type || '—'}</span></td>
      <td><span class="badge ${statBadge[m.status] || 'badge-info'}">${m.status || '—'}</span></td>
      <td style="font-size:.82rem;">${m.user || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.doc || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--accent-gold);font-weight:700;">${m.materialId || '—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${m.desc || '—'}</td>
      <td><span class="badge badge-info">${m.um || '—'}</span></td>
      <td style="font-size:.82rem;">${m.category || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;text-align:center;font-weight:700;">${m.ubicBase || '—'}</td>
      <td style="font-size:.82rem;color:var(--text-muted);font-style:italic;">${m.position || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--accent-gold);">${m.ubicFinal || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;text-align:center;">${m.ubicBase || '—'}</td>
      <td><span class="badge ${m.bodega === 'Bodegas Externas' ? 'badge-info' : 'badge-success'}">${m.bodega || '—'}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotAlm || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotProv || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.expiry || '—'}</td>
      <td style="text-align:center;font-weight:700;font-size:.95rem;">${m.qty || '—'}</td>
      <td style="text-align:center;">
        <div style="display:inline-flex;gap:.5rem;">
          <button class="btn btn-secondary btn-icon-only" onclick="editDE_Movimiento('${m.id}')" title="Editar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Movimiento('${m.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function setDE_MovFilter(key, value) {
    _deMovFilters[key] = value;

    // Actualizar estado visual de los pills del grupo correspondiente
    document.querySelectorAll(`.de-filter-pills[data-group="${key}"] .de-filter-pill`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });

    applyDE_MovFilters();
}

function clearDE_MovDates() {
    _deMovFilters.desde = '';
    _deMovFilters.hasta = '';
    const desdeEl = document.getElementById('de-mov-filter-desde');
    const hastaEl = document.getElementById('de-mov-filter-hasta');
    if (desdeEl) desdeEl.value = '';
    if (hastaEl) hastaEl.value = '';
    applyDE_MovFilters();
    renderDE_Movimientos();
}

function applyDE_MovFilters() {
    const { tipo, estado, bodega, zona, desde, hasta } = _deMovFilters;
    const query = (document.getElementById('de-mov-search')?.value || '').toLowerCase().trim();

    const filtered = state.movements.filter(m => {
        if (tipo !== 'todos' && m.type !== tipo) return false;
        if (estado !== 'todos' && m.status !== estado) return false;
        if (bodega !== 'todas' && m.bodega !== bodega) return false;
        if (zona !== 'todas' && String(m.ubicBase || '') !== zona) return false;
        if (desde) {
            const d = (m.datetime || '').split('T')[0];
            if (d < desde) return false;
        }
        if (hasta) {
            const d = (m.datetime || '').split('T')[0];
            if (d > hasta) return false;
        }
        if (query) {
            return (
                (m.user || '').toLowerCase().includes(query) ||
                (m.doc || '').toLowerCase().includes(query) ||
                (m.materialId || '').toLowerCase().includes(query) ||
                (m.desc || '').toLowerCase().includes(query) ||
                (m.category || '').toLowerCase().includes(query) ||
                (m.lotAlm || '').toLowerCase().includes(query) ||
                (m.lotProv || '').toLowerCase().includes(query) ||
                (m.ubicFinal || '').toLowerCase().includes(query) ||
                String(m.ubicBase || '').includes(query)
            );
        }
        return true;
    });

    const tbody = document.getElementById('de-mov-tbody');
    const counter = document.getElementById('de-mov-count');
    if (tbody) tbody.innerHTML = buildDE_MovRows(filtered);
    if (counter) counter.innerText = `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`;
}

function saveDE_Movimiento(e) {
    e.preventDefault();
    const editId = document.getElementById('de-mov-edit-id').value;
    const mov = {
        id: editId || Date.now().toString(),
        datetime: document.getElementById('de-mov-datetime').value,
        type: document.getElementById('de-mov-type').value,
        status: document.getElementById('de-mov-status').value,
        user: document.getElementById('de-mov-user').value.trim(),
        doc: document.getElementById('de-mov-doc').value.trim(),
        materialId: document.getElementById('de-mov-material').value,
        desc: document.getElementById('de-mov-desc').value.trim(),
        um: document.getElementById('de-mov-um').value.trim(),
        category: document.getElementById('de-mov-category').value.trim(),
        ubicBase: document.getElementById('de-mov-ubic-base').value,
        position: document.getElementById('de-mov-position').value.trim(),
        ubicFinal: document.getElementById('de-mov-ubic-final').value,
        bodega: document.getElementById('de-mov-bodega').value,
        lotAlm: document.getElementById('de-mov-lot-alm').value.trim(),
        lotProv: document.getElementById('de-mov-lot-prov').value.trim(),
        expiry: document.getElementById('de-mov-expiry').value,
        qty: parseInt(document.getElementById('de-mov-qty').value) || 0
    };
    if (editId) {
        const idx = state.movements.findIndex(m => m.id === editId);
        if (idx !== -1) state.movements[idx] = mov;
        triggerToast('success', `Movimiento actualizado correctamente.`);
        _deMovEditId = null;
    } else {
        state.movements.push(mov);
        triggerToast('success', `Movimiento de tipo "${mov.type}" registrado.`);
    }
    saveDEKey('movements');
    renderDE_Movimientos();
}

function editDE_Movimiento(id) {
    _deMovEditId = id;
    renderDE_Movimientos();
    document.getElementById('dataentry-content').scrollIntoView({ behavior: 'smooth' });
}

function cancelDE_MovEdit() {
    _deMovEditId = null;
    renderDE_Movimientos();
}

function deleteDE_Movimiento(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    state.movements = state.movements.filter(m => m.id !== id);
    saveDEKey('movements');
    if (_deMovEditId === id) _deMovEditId = null;
    renderDE_Movimientos();
}


// --------------------------------------------------------------------------
//   APARTADO: EN TRÁNSITO
//   Muestra únicamente movimientos con estado = "En Tránsito"
// --------------------------------------------------------------------------
let _deTrSearch = '';

function renderDE_Transito() {
    const records = state.movements.filter(m => m.status === 'En Tránsito');

    const locOptions = state.locations.map(l =>
        `<option value="${l.final || l.base}">`
    ).join('');

    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">
      <div class="dataentry-section-card">

        <div class="dataentry-section-header">
          <span class="dataentry-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            Movimientos en Tránsito
          </span>
          <div style="display:flex;gap:.75rem;">
            <button class="btn btn-secondary btn-sm" onclick="exportDE_TrCSV()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                <line x1="9" y1="15" x2="15" y2="15"/><line x1="12" y1="12" x2="12" y2="18"/>
              </svg>
              Exportar CSV
            </button>
            <button class="btn btn-secondary btn-sm" onclick="printDE_TrSoporte()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Imprimir Soporte
            </button>
          </div>
        </div>

        <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:1.25rem;">
          Registros automáticos desde <strong style="color:var(--text-secondary);">Movimientos</strong> con estado
          <span class="badge badge-warning">En Tránsito</span>. Para agregar, usa el apartado de Movimientos.
        </p>

        <!-- Datalist de ubicaciones -->
        <datalist id="de-tr-loc-list">${locOptions}</datalist>

        <!-- Búsqueda -->
        <div class="input-wrapper" style="margin-bottom:1.25rem;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="form-input" id="de-tr-search"
            placeholder="Buscar por fecha, usuario, material, descripción, lote, ubicación..."
            value="${_deTrSearch}"
            oninput="filterDE_Tr(this.value)">
        </div>

        <!-- Tabla -->
        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Usuario</th>
              <th>Material</th>
              <th>Descripción</th>
              <th>Unidad</th>
              <th>Categoría</th>
              <th>UM</th>
              <th>UMB</th>
              <th>Lote Alm.</th>
              <th>Lote Prov.</th>
              <th>F. Fabricación</th>
              <th>F. Vencimiento</th>
              <th style="text-align:center;">Cantidad</th>
              <th style="min-width:160px;">Asignar Ubicación</th>
              <th>Validación</th>
              <th style="text-align:center;">Acción</th>
            </tr></thead>
            <tbody id="de-tr-tbody">
              ${buildDE_TrRows(records)}
            </tbody>
          </table>
        </div>
        <div style="margin-top:.75rem;font-size:.8rem;color:var(--text-muted);" id="de-tr-count">
          ${records.length} registro${records.length !== 1 ? 's' : ''} en tránsito
        </div>

      </div>
    </div>`;
}

function buildDE_TrRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="17" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">No hay movimientos en tránsito.</td></tr>`;
    }

    return [...list].reverse().map(m => {
        const mat = state.materials.find(x => x.id === m.materialId);
        const unidad = mat?.unit || '—';
        const valid = m.transitValidation || 'Pendiente';
        const validBadge = valid === 'Admitido' ? 'badge-success' : 'badge-warning';
        const assigned = m.transitLocation || '';

        return `<tr>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;white-space:nowrap;">${(m.datetime || '').replace('T', ' ')}</td>
          <td><span class="badge badge-warning">En Tránsito</span></td>
          <td style="font-size:.82rem;">${m.user || '—'}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--accent-gold);font-weight:700;">${m.materialId || '—'}</td>
          <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${m.desc || '—'}</td>
          <td style="text-align:center;font-weight:600;">${unidad}</td>
          <td style="font-size:.82rem;">${m.category || '—'}</td>
          <td><span class="badge badge-info">${m.um || '—'}</span></td>
          <td>
            <input type="text" id="de-tr-umb-${m.id}"
              value="${m.transitUMB || ''}"
              class="form-input" placeholder="UMB"
              style="width:72px;padding:.3rem .4rem;font-size:.78rem;font-family:'JetBrains Mono',monospace;">
          </td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotAlm || '—'}</td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.lotProv || '—'}</td>
          <td>
            <input type="date" id="de-tr-fab-${m.id}"
              value="${m.transitFab || ''}"
              class="form-input"
              style="width:136px;padding:.3rem .4rem;font-size:.78rem;">
          </td>
          <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${m.expiry || '—'}</td>
          <td style="text-align:center;font-weight:700;font-size:.95rem;">${m.qty || '—'}</td>
          <td>
            <input type="text" id="de-tr-loc-${m.id}"
              list="de-tr-loc-list"
              value="${assigned}"
              class="form-input" placeholder="Seleccionar o escribir..."
              style="min-width:148px;padding:.3rem .5rem;font-size:.8rem;"
              ${valid === 'Admitido' ? 'style="min-width:148px;padding:.3rem .5rem;font-size:.8rem;border-color:rgba(16,185,129,.4);"' : ''}>
          </td>
          <td>
            <span class="badge ${validBadge}">${valid}</span>
          </td>
          <td style="text-align:center;">
            <button class="btn btn-primary btn-sm" onclick="asignarDE_Tr('${m.id}')"
              style="padding:.35rem .9rem;font-size:.8rem;white-space:nowrap;">
              Asignar
            </button>
          </td>
        </tr>`;
    }).join('');
}

function asignarDE_Tr(movId) {
    const loc = (document.getElementById(`de-tr-loc-${movId}`)?.value || '').trim();
    const umb = (document.getElementById(`de-tr-umb-${movId}`)?.value || '').trim();
    const fab = document.getElementById(`de-tr-fab-${movId}`)?.value || '';

    if (!loc) {
        triggerToast('error', 'Debes ingresar o seleccionar una ubicación antes de asignar.');
        return;
    }

    const idx = state.movements.findIndex(m => m.id === movId);
    if (idx === -1) return;

    state.movements[idx].transitLocation = loc;
    state.movements[idx].transitUMB = umb;
    state.movements[idx].transitFab = fab;
    state.movements[idx].transitValidation = 'Admitido';

    saveDEKey('movements');
    triggerToast('success', `Ubicación "${loc}" asignada — Validación: Admitido.`);
    renderDE_Transito();
}

function filterDE_Tr(query) {
    _deTrSearch = query.toLowerCase().trim();
    const records = state.movements.filter(m => m.status === 'En Tránsito');
    const filtered = _deTrSearch
        ? records.filter(m => {
            const mat = state.materials.find(x => x.id === m.materialId);
            return (
                (m.datetime || '').toLowerCase().includes(_deTrSearch) ||
                (m.user || '').toLowerCase().includes(_deTrSearch) ||
                (m.materialId || '').toLowerCase().includes(_deTrSearch) ||
                (m.desc || '').toLowerCase().includes(_deTrSearch) ||
                (m.category || '').toLowerCase().includes(_deTrSearch) ||
                (m.um || '').toLowerCase().includes(_deTrSearch) ||
                (m.lotAlm || '').toLowerCase().includes(_deTrSearch) ||
                (m.lotProv || '').toLowerCase().includes(_deTrSearch) ||
                (m.transitLocation || '').toLowerCase().includes(_deTrSearch) ||
                (m.transitValidation || '').toLowerCase().includes(_deTrSearch) ||
                (mat?.unit || '').toString().toLowerCase().includes(_deTrSearch)
            );
        })
        : records;

    const tbody = document.getElementById('de-tr-tbody');
    const counter = document.getElementById('de-tr-count');
    if (tbody) tbody.innerHTML = buildDE_TrRows(filtered);
    if (counter) counter.innerText = `${filtered.length} registro${filtered.length !== 1 ? 's' : ''} en tránsito`;
}

function exportDE_TrCSV() {
    const records = state.movements.filter(m => m.status === 'En Tránsito');
    if (records.length === 0) { triggerToast('error', 'No hay registros en tránsito para exportar.'); return; }

    const headers = ['Fecha', 'Estado', 'Usuario', 'Material', 'Descripcion', 'Unidad', 'Categoria', 'UM', 'UMB',
        'LoteAlmacen', 'LoteProveedor', 'F.Fabricacion', 'F.Vencimiento', 'Cantidad',
        'UbicacionAsignada', 'Validacion'];
    const rows = [...records].reverse().map(m => {
        const mat = state.materials.find(x => x.id === m.materialId);
        return [
            `"${(m.datetime || '').replace('T', ' ')}"`,
            'En Tránsito',
            m.user || '',
            m.materialId || '',
            `"${m.desc || ''}"`,
            mat?.unit || '',
            `"${m.category || ''}"`,
            m.um || '',
            m.transitUMB || '',
            m.lotAlm || '',
            m.lotProv || '',
            m.transitFab || '',
            m.expiry || '',
            m.qty || '',
            m.transitLocation || '',
            m.transitValidation || 'Pendiente'
        ];
    });

    const csv = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `EnTransito_Aureo_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    triggerToast('success', `CSV exportado (${records.length} registros).`);
}

function printDE_TrSoporte() {
    const records = state.movements.filter(m => m.status === 'En Tránsito');
    if (records.length === 0) { triggerToast('error', 'No hay registros en tránsito para imprimir.'); return; }

    const company = state.settings?.companyName || 'AUREO';
    const printDate = new Date().toLocaleString('es-ES');
    const sorted = [...records].reverse();

    const rows = sorted.map((m, i) => {
        const mat = state.materials.find(x => x.id === m.materialId);
        const valid = m.transitValidation || 'Pendiente';
        return `
        <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="center">${i + 1}</td>
          <td class="mono">${(m.datetime || '').replace('T', ' ')}</td>
          <td class="center badge-cell admitido-${valid === 'Admitido'}">${valid}</td>
          <td>${m.user || '—'}</td>
          <td class="mono">${m.materialId || '—'}</td>
          <td>${m.desc || '—'}</td>
          <td class="center">${mat?.unit || '—'}</td>
          <td>${m.category || '—'}</td>
          <td class="center mono">${m.um || '—'}</td>
          <td class="center mono">${m.transitUMB || '—'}</td>
          <td class="mono">${m.lotAlm || '—'}</td>
          <td class="mono">${m.lotProv || '—'}</td>
          <td class="mono">${m.transitFab || '—'}</td>
          <td class="mono">${m.expiry || '—'}</td>
          <td class="center bold">${m.qty || '—'}</td>
          <td class="mono">${m.transitLocation || '_______________'}</td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank', 'width=1300,height=850');
    w.document.write(`<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>Soporte En Tránsito — ${company}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Arial,sans-serif;font-size:8.5pt;color:#111;background:#fff;}

      .header{padding:12px 18px 10px;border-bottom:3px solid #111;display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;}
      .header-left h1{font-size:15pt;font-weight:800;letter-spacing:1px;}
      .header-left h2{font-size:9.5pt;font-weight:400;color:#555;margin-top:2px;}
      .header-right{text-align:right;font-size:7.5pt;color:#555;line-height:1.7;}
      .header-right strong{color:#111;font-size:8.5pt;}

      .badge-tr{display:inline-block;background:#fef3c7;border:1px solid #d97706;color:#92400e;padding:1px 8px;border-radius:3px;font-size:7.5pt;font-weight:700;text-transform:uppercase;}

      table{width:100%;border-collapse:collapse;}
      thead tr{background:#111;color:#fff;}
      thead th{padding:5px 4px;text-align:left;font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;border-right:1px solid #333;}
      thead th:last-child{border-right:none;}

      tbody tr.even{background:#f9fafb;}
      tbody tr.odd{background:#fff;}
      td{padding:4px 4px;font-size:7.5pt;border-bottom:1px solid #e5e7eb;border-right:1px solid #f3f4f6;vertical-align:middle;}
      td:last-child{border-right:none;}

      .mono{font-family:'Courier New',monospace;font-size:7pt;}
      .center{text-align:center;}
      .bold{font-weight:700;}
      .badge-cell{font-weight:700;color:#92400e;}
      .admitido-true{color:#065f46 !important;}

      .sig-block{margin-top:28px;display:flex;gap:50px;}
      .sig-line{flex:1;border-top:1px solid #9ca3af;padding-top:4px;font-size:7.5pt;color:#6b7280;}
      .footer{margin-top:12px;padding-top:7px;border-top:1px solid #d1d5db;display:flex;justify-content:space-between;font-size:7pt;color:#9ca3af;}

      @media print{
        @page{size:landscape;margin:8mm 6mm;}
        thead tr{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        tbody tr.even{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      }
    </style></head><body>

    <div class="header">
      <div class="header-left">
        <h1>${company}</h1>
        <h2>Soporte de Movimientos — <span class="badge-tr">En Tránsito</span></h2>
      </div>
      <div class="header-right">
        <strong>Emisión:</strong> ${printDate}<br>
        <strong>Total registros:</strong> ${sorted.length}<br>
        <strong>Doc:</strong> VF-TR-${Date.now().toString().slice(-6)}
      </div>
    </div>

    <table>
      <thead><tr>
        <th style="width:24px;">#</th>
        <th style="width:108px;">Fecha</th>
        <th style="width:68px;">Validación</th>
        <th style="width:62px;">Usuario</th>
        <th style="width:68px;">Material</th>
        <th style="width:140px;">Descripción</th>
        <th style="width:42px;">Unidad</th>
        <th style="width:88px;">Categoría</th>
        <th style="width:32px;">UM</th>
        <th style="width:36px;">UMB</th>
        <th style="width:60px;">Lote Alm.</th>
        <th style="width:60px;">Lote Prov.</th>
        <th style="width:72px;">F. Fabricación</th>
        <th style="width:72px;">F. Vencimiento</th>
        <th style="width:38px;">Cant.</th>
        <th style="width:100px;">Ubicación Asig.</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="sig-block">
      <div class="sig-line">Elaborado por: _________________________ &nbsp; Nombre y Firma</div>
      <div class="sig-line">Revisado por: _________________________ &nbsp; Nombre y Firma</div>
      <div class="sig-line">Fecha de entrega: _____________________</div>
    </div>

    <div class="footer">
      <span>Generado por AUREO · Sistema de Gestión de Ferretería</span>
      <span>Documento de uso interno — no válido como comprobante fiscal</span>
    </div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    triggerToast('success', 'Soporte enviado a impresión.');
}

// --------------------------------------------------------------------------
//   APARTADO: HISTORIAL DE RÓTULOS
// --------------------------------------------------------------------------
let _deRotSearch = '';
let _deRotSerial = '';

function _getWeekNumber(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    return `S${String(week).padStart(2, '0')}-${d.getFullYear()}`;
}

function renderDE_Rotulos() {
    const el = document.getElementById('dataentry-content');
    el.innerHTML = `
    <div class="dataentry-panel">

      <!-- TABLA -->
      <div class="dataentry-section-card">
        <div class="dataentry-section-header">
          <span class="dataentry-section-title">Historial de Rótulos</span>
          <span class="badge badge-info" id="de-rot-count">${state.labels.length} registros</span>
        </div>

        <!-- Barra de búsqueda y acciones -->
        <div class="de-rot-searchbar">
          <!-- Búsqueda manual -->
          <div class="input-wrapper" style="flex:1;min-width:220px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" class="form-input" id="de-rot-search"
              placeholder="Buscar por proveedor, SKU, texto breve, documento, lote, semana..."
              value="${_deRotSearch}"
              onkeydown="if(event.key==='Enter') applyDE_RotFilters()">
          </div>

          <!-- Filtro por Serial Impresión -->
          <div style="display:flex;flex-direction:column;gap:.25rem;min-width:180px;">
            <span style="font-size:.75rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.8px;">Serial Impresión</span>
            <input type="text" class="form-input" id="de-rot-serial-filter"
              placeholder="Ej: SER-0001"
              value="${_deRotSerial}"
              style="font-family:'JetBrains Mono',monospace;font-size:.85rem;"
              onkeydown="if(event.key==='Enter') applyDE_RotFilters()">
          </div>

          <!-- Botones de acción -->
          <div style="display:flex;align-items:flex-end;gap:.6rem;">
            <button class="btn btn-primary" onclick="applyDE_RotFilters()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Buscar
            </button>
            <button class="btn btn-secondary" onclick="clearDE_RotFilters()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Limpiar filtros
            </button>
            <button class="btn btn-secondary" onclick="exportDE_RotCSV()">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:.3rem;">
                <path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/>
                <line x1="9" y1="15" x2="15" y2="15"/><line x1="12" y1="12" x2="12" y2="18"/>
              </svg>
              Exportar CSV
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="custom-table">
            <thead><tr>
              <th>Serial Imp.</th>
              <th>Serial Cita</th>
              <th>Fecha Rec.</th>
              <th>Semana</th>
              <th>Proveedor</th>
              <th>Auxiliar</th>
              <th>Documento</th>
              <th>Remesa</th>
              <th>Orden Compra</th>
              <th style="text-align:center;">Cantidad</th>
              <th>SKU</th>
              <th>Texto Breve</th>
              <th>UM</th>
              <th>UMB</th>
              <th>F. Fabricación</th>
              <th>F. Vencimiento</th>
              <th>Lote Prov.</th>
              <th>Lote Alm.</th>
              <th style="text-align:center;">Acción</th>
            </tr></thead>
            <tbody id="de-rot-tbody">
              ${buildDE_RotRows(state.labels)}
            </tbody>
          </table>
        </div>
      </div>

    </div>`;
}

function printDE_RotLabel(id) {
    const l = state.labels.find(x => x.id === id);
    if (!l) return;
    // Formato de impresión pendiente — se definirá en próxima iteración
    triggerToast('notif', `Impresión de rótulo "${l.serialImp}" — formato en configuración.`);
}

function buildDE_RotRows(list) {
    if (list.length === 0) {
        return `<tr><td colspan="19" style="text-align:center;color:var(--text-muted);padding:2.5rem 0;">Sin rótulos registrados.</td></tr>`;
    }
    return [...list].reverse().map(l => `
    <tr>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:700;color:var(--accent-gold);">${l.serialImp || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.serialCita || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.fechaRec || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;font-weight:600;">${l.semana || '—'}</td>
      <td style="font-size:.82rem;">${l.proveedor || '—'}</td>
      <td style="font-size:.82rem;">${l.auxiliar || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.documento || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.remesa || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.ordenCompra || '—'}</td>
      <td style="text-align:center;font-weight:700;">${l.cantidad || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.sku || '—'}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem;">${l.textoBreve || '—'}</td>
      <td><span class="badge badge-info">${l.um || '—'}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.umb || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.fFabricacion || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.fVencimiento || '—'}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.loteProv || '—'}</td>
      <td>
        <div style="display:inline-flex;align-items:center;gap:.5rem;">
          <span style="font-family:'JetBrains Mono',monospace;font-size:.78rem;">${l.loteAlm || '—'}</span>
          <button class="btn btn-secondary btn-icon-only" onclick="printDE_RotLabel('${l.id}')" title="Imprimir rótulo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
          </button>
        </div>
      </td>
      <td style="text-align:center;">
        <button class="btn btn-danger btn-icon-only" onclick="deleteDE_Rotulo('${l.id}')" title="Eliminar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </td>
    </tr>`).join('');
}

function applyDE_RotFilters() {
    _deRotSearch = (document.getElementById('de-rot-search')?.value || '').toLowerCase().trim();
    _deRotSerial = (document.getElementById('de-rot-serial-filter')?.value || '').toLowerCase().trim();

    const filtered = state.labels.filter(l => {
        if (_deRotSerial && !(l.serialImp || '').toLowerCase().includes(_deRotSerial)) return false;
        if (_deRotSearch) {
            return (
                (l.serialCita || '').toLowerCase().includes(_deRotSearch) ||
                (l.semana || '').toLowerCase().includes(_deRotSearch) ||
                (l.proveedor || '').toLowerCase().includes(_deRotSearch) ||
                (l.auxiliar || '').toLowerCase().includes(_deRotSearch) ||
                (l.documento || '').toLowerCase().includes(_deRotSearch) ||
                (l.remesa || '').toLowerCase().includes(_deRotSearch) ||
                (l.ordenCompra || '').toLowerCase().includes(_deRotSearch) ||
                (l.sku || '').toLowerCase().includes(_deRotSearch) ||
                (l.textoBreve || '').toLowerCase().includes(_deRotSearch) ||
                (l.loteProv || '').toLowerCase().includes(_deRotSearch) ||
                (l.loteAlm || '').toLowerCase().includes(_deRotSearch) ||
                (l.fechaRec || '').includes(_deRotSearch)
            );
        }
        return true;
    });

    const tbody = document.getElementById('de-rot-tbody');
    const counter = document.getElementById('de-rot-count');
    if (tbody) tbody.innerHTML = buildDE_RotRows(filtered);
    if (counter) counter.innerText = `${filtered.length} ${(_deRotSearch || _deRotSerial) ? 'resultado' + (filtered.length !== 1 ? 's' : '') : 'registros'}`;
}

function clearDE_RotFilters() {
    _deRotSearch = '';
    _deRotSerial = '';
    const searchEl = document.getElementById('de-rot-search');
    const serialEl = document.getElementById('de-rot-serial-filter');
    if (searchEl) searchEl.value = '';
    if (serialEl) serialEl.value = '';

    const tbody = document.getElementById('de-rot-tbody');
    const counter = document.getElementById('de-rot-count');
    if (tbody) tbody.innerHTML = buildDE_RotRows(state.labels);
    if (counter) counter.innerText = `${state.labels.length} registros`;
}

function exportDE_RotCSV() {
    // Formato pendiente — se definirá en próxima iteración
    triggerToast('notif', 'Exportación CSV — formato en configuración.');
}


function deleteDE_Rotulo(id) {
    const l = state.labels.find(l => l.id === id);
    if (!l) return;
    if (!confirm(`¿Eliminar rótulo "${l.serialImp}"?`)) return;
    state.labels = state.labels.filter(l => l.id !== id);
    saveDEKey('labels');
    if (_deRotEditId === id) _deRotEditId = null;
    renderDE_Rotulos();
}

// --- TOAST NOTIFICATIONS DRIVER ---
function triggerToast(type, message) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;

    let svgIcon = '';
    if (type === 'success') {
        svgIcon = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
        svgIcon = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else { // default info / notification
        svgIcon = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
        ${svgIcon}
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 4.5 seconds
    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// ==========================================================================
//   MÓDULO: ÍNDICES DE OCUPACIÓN DE BODEGA
// ==========================================================================

const WH_GRID = { aisles: ['A', 'B', 'C', 'D'], shelvesPerAisle: 5, levelsPerShelf: 3 };
const WH_CAPACITY = 300;                          // total warehouse slots
const WH_AISLE_CAP = Math.round(WH_CAPACITY / 4); // 75 per aisle

const OCC_AISLE_CLR = { A: '#2E4A6E', B: '#4A7AB5', C: '#1E3352', D: '#A8442C' };
const OCC_ABC_CLR = { A: '#2E4A6E', B: '#4A7AB5', C: '#7BA3D0' };
const OCC_CAT_CLR = ['#2E4A6E', '#4A7AB5', '#1E3352', '#A8442C', '#3A6090', '#5E7D52', '#7BA3D0'];

let _occMode = 'general'; // 'general' | 'diario' | 'mensual'
let _occFilter = 'todo';    // 'todo' | 'pasillo' | 'categoria' | 'abc'
let _occOpenAisles = new Set();
let _occOpenCats = new Set();

// ── Donut SVG via stroke-dasharray ────────────────────────────────────────────
function buildDonutSVG(segments, { size = 150, thick = 26 } = {}) {
    const total = segments.reduce((s, g) => s + g.value, 0);
    const cx = size / 2, cy = size / 2;
    const r = (size - thick) / 2;
    const C = 2 * Math.PI * r;

    if (total === 0) {
        return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(36,31,26,.06)" stroke-width="${thick}"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="rgba(36,31,26,.25)" font-size="11">Sin datos</text>
        </svg>`;
    }

    let cumLen = 0;
    const arcs = segments.filter(s => s.value > 0).map(seg => {
        const segLen = (seg.value / total) * C;
        const offset = C - cumLen;
        cumLen += segLen;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}"
            stroke-width="${thick}" stroke-linecap="butt"
            stroke-dasharray="${segLen.toFixed(2)} ${(C - segLen).toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})"/>`;
    });

    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(36,31,26,.06)" stroke-width="${thick}"/>
        ${arcs.join('')}
    </svg>`;
}

// ── Compute all occupancy metrics ─────────────────────────────────────────────
function computeOccupancyData() {
    const prods = state.products;

    const byAisle = {};
    WH_GRID.aisles.forEach(a => { byAisle[a] = 0; });
    prods.forEach(p => { if (p.aisle && byAisle[p.aisle] !== undefined) byAisle[p.aisle]++; });

    const byCategory = {};
    prods.forEach(p => {
        const cat = p.category || 'Sin categoría';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    let classification = [];
    try { classification = calculateABCClassification(); } catch (e) { }
    const byABC = { A: 0, B: 0, C: 0 };
    classification.forEach(p => { if (byABC[p.abcClass] !== undefined) byABC[p.abcClass]++; });
    const classifiedIds = new Set(classification.map(p => p.id));
    prods.forEach(p => { if (!classifiedIds.has(p.id)) byABC.C++; });

    const totalOccupied = prods.length;
    const occupancyPct = Math.round((totalOccupied / WH_CAPACITY) * 100);

    const today = new Date().toISOString().split('T')[0];
    const todayInv = state.invoices.filter(i => i.date === today);
    const dailyOrders = todayInv.length;
    const dailyUnits = todayInv.reduce((s, i) => s + (i.items || []).reduce((ss, it) => ss + (it.qty || 0), 0), 0);

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const byDay = {};
    state.invoices.filter(i => i.date && i.date.startsWith(monthStr)).forEach(i => {
        const u = (i.items || []).reduce((s, it) => s + (it.qty || 0), 0);
        byDay[i.date] = (byDay[i.date] || 0) + u;
    });
    const dayEntries = Object.entries(byDay).sort((a, b) => b[1] - a[1]);
    const monthlyRecord = dayEntries[0] ? dayEntries[0][1] : 0;
    const recordDate = dayEntries[0] ? dayEntries[0][0] : '—';

    return {
        byAisle, byCategory, byABC, totalOccupied, occupancyPct,
        dailyOrders, dailyUnits, monthlyRecord, recordDate,
        freeSlots: Math.max(0, WH_CAPACITY - totalOccupied)
    };
}

// ── Mode / filter controls ────────────────────────────────────────────────────
function setOccMode(m) { _occMode = m; _renderOccChart(); }
function setOccFilter(f) { _occFilter = f; _renderOccChart(); }

function _getOccSegments(d) {
    // Occupied count depends on mode
    let occupied;
    if (_occMode === 'general') occupied = state.products.length;
    else if (_occMode === 'diario') occupied = d.dailyUnits;
    else occupied = d.monthlyRecord;

    const free = Math.max(0, WH_CAPACITY - occupied);
    const freeLabel = _occMode === 'general' ? 'Disponible' : 'Sin actividad';
    const freeSeg = { label: freeLabel, value: free, color: 'rgba(36,31,26,0.09)' };

    let segments, centerVal, centerSub;

    if (_occFilter === 'todo') {
        const clr = _occMode === 'general' ? '#2E4A6E' : _occMode === 'diario' ? '#4A7AB5' : '#A8442C';
        const lbl = _occMode === 'general' ? 'Ocupado' : _occMode === 'diario' ? 'Despachado hoy' : 'Récord día';
        segments = [{ label: lbl, value: occupied, color: clr }, freeSeg].filter(s => s.value >= 0);
        centerVal = _occMode === 'general' ? (Math.round((occupied / WH_CAPACITY) * 100) + '%') : occupied;
        centerSub = _occMode === 'general' ? 'ocupación' : _occMode === 'diario' ? 'uds hoy' : 'uds récord';

    } else if (_occFilter === 'pasillo') {
        let byAisle;
        if (_occMode === 'general') {
            byAisle = Object.assign({}, d.byAisle);
        } else {
            byAisle = {};
            WH_GRID.aisles.forEach(a => { byAisle[a] = 0; });
            const targetDate = _occMode === 'diario'
                ? new Date().toISOString().split('T')[0]
                : d.recordDate;
            state.invoices.filter(i => i.date === targetDate).forEach(inv => {
                (inv.items || []).forEach(it => {
                    const prod = state.products.find(p =>
                        p.sku === it.sku || p.name === it.name || p.id === it.productId);
                    if (prod && prod.aisle && WH_GRID.aisles.includes(prod.aisle))
                        byAisle[prod.aisle] += (it.qty || 0);
                });
            });
        }
        segments = WH_GRID.aisles.map(a => ({ label: 'Pasillo ' + a, value: byAisle[a] || 0, color: OCC_AISLE_CLR[a] }));
        segments.push(freeSeg);
        centerVal = occupied;
        centerSub = _occMode === 'general' ? 'productos' : 'unidades';

    } else if (_occFilter === 'categoria') {
        let byCat = {};
        if (_occMode === 'general') {
            byCat = Object.assign({}, d.byCategory);
        } else {
            const targetDate = _occMode === 'diario'
                ? new Date().toISOString().split('T')[0]
                : d.recordDate;
            state.invoices.filter(i => i.date === targetDate).forEach(inv => {
                (inv.items || []).forEach(it => {
                    const prod = state.products.find(p =>
                        p.sku === it.sku || p.name === it.name || p.id === it.productId);
                    const cat = (prod && prod.category) ? prod.category : 'Sin categoría';
                    byCat[cat] = (byCat[cat] || 0) + (it.qty || 0);
                });
            });
        }
        const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const top = entries.slice(0, 6).map(function (e, i) { return { label: e[0], value: e[1], color: OCC_CAT_CLR[i] }; });
        if (entries.length > 6)
            top.push({ label: 'Otras categorías', value: entries.slice(6).reduce((s, e) => s + e[1], 0), color: '#6b7280' });
        segments = top;
        segments.push(freeSeg);
        centerVal = occupied;
        centerSub = _occMode === 'general' ? 'productos' : 'unidades';

    } else { // abc
        let byABC;
        if (_occMode === 'general') {
            byABC = Object.assign({}, d.byABC);
        } else {
            byABC = { A: 0, B: 0, C: 0 };
            let cls = [];
            try { cls = calculateABCClassification(); } catch (e) { }
            const classMap = {};
            cls.forEach(p => { classMap[p.id] = p.abcClass; });
            const targetDate = _occMode === 'diario'
                ? new Date().toISOString().split('T')[0]
                : d.recordDate;
            state.invoices.filter(i => i.date === targetDate).forEach(inv => {
                (inv.items || []).forEach(it => {
                    const prod = state.products.find(p =>
                        p.sku === it.sku || p.name === it.name || p.id === it.productId);
                    if (prod) { const c = classMap[prod.id] || 'C'; byABC[c] = (byABC[c] || 0) + (it.qty || 0); }
                });
            });
        }
        segments = [
            { label: 'Clase A · Alto mov.', value: byABC.A, color: OCC_ABC_CLR.A },
            { label: 'Clase B · Medio', value: byABC.B, color: OCC_ABC_CLR.B },
            { label: 'Clase C · Bajo mov.', value: byABC.C, color: OCC_ABC_CLR.C },
            freeSeg
        ];
        centerVal = occupied;
        centerSub = _occMode === 'general' ? 'productos' : 'unidades';
    }

    return { segments: segments.filter(s => s.value >= 0), centerVal, centerSub };
}

// ── Partial chart re-render (no full page rebuild) ────────────────────────────
function _renderOccChart() {
    // Sync mode button styles
    ['general', 'diario', 'mensual'].forEach(function (m) {
        const btn = document.getElementById('occ-mode-' + m);
        if (!btn) return;
        const on = _occMode === m;
        btn.style.background = on ? 'var(--primary,#2E4A6E)' : 'rgba(36,31,26,0.04)';
        btn.style.color = on ? '#fff' : 'var(--text-secondary)';
        btn.style.borderColor = on ? 'transparent' : 'rgba(36,31,26,0.1)';
    });
    // Sync filter button styles
    ['todo', 'pasillo', 'categoria', 'abc'].forEach(function (f) {
        const btn = document.getElementById('occ-filter-' + f);
        if (!btn) return;
        const on = _occFilter === f;
        btn.style.background = on ? 'rgba(192,138,45,0.2)' : 'transparent';
        btn.style.color = on ? '#2E2208' : 'var(--text-muted)';
        btn.style.borderColor = on ? '#2E4A6E' : 'rgba(36,31,26,0.08)';
    });

    const chartEl = document.getElementById('occ-chart-area');
    if (!chartEl) return;

    const d = computeOccupancyData();
    const { segments, centerVal, centerSub } = _getOccSegments(d);
    const totalSeg = segments.reduce(function (s, g) { return s + g.value; }, 0);

    const legend = segments.filter(function (s) { return s.value > 0; }).map(function (seg) {
        const pct = totalSeg > 0 ? Math.round((seg.value / totalSeg) * 100) : 0;
        const isAvail = seg.label === 'Disponible' || seg.label === 'Sin actividad';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid rgba(36,31,26,.04);">'
            + '<div style="display:flex;align-items:center;gap:.45rem;min-width:0;">'
            + '<span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + seg.color + ';'
            + (isAvail ? 'border:1px solid rgba(36,31,26,0.2);' : '') + '"></span>'
            + '<span style="font-size:.79rem;color:' + (isAvail ? 'var(--text-muted)' : 'var(--text-secondary)') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + seg.label + '</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0;margin-left:.5rem;">'
            + '<span style="font-size:.8rem;font-weight:700;color:' + (isAvail ? 'var(--text-muted)' : 'var(--text-primary)') + ';">' + seg.value + '</span>'
            + '<span style="font-size:.72rem;color:var(--text-muted);min-width:30px;text-align:right;">' + pct + '%</span>'
            + '</div></div>';
    }).join('');

    const stockPct = Math.min(100, Math.round((state.products.length / WH_CAPACITY) * 100));
    const barClr = stockPct >= 85 ? '#A8442C' : stockPct >= 60 ? '#4A7AB5' : '#5E7D52';

    chartEl.innerHTML =
        '<div style="display:flex;align-items:center;gap:2.5rem;flex-wrap:wrap;justify-content:center;padding:1.25rem 0 .75rem;">'
        + '<div style="position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;">'
        + buildDonutSVG(segments, { size: 230, thick: 34 })
        + '<div style="position:absolute;text-align:center;pointer-events:none;line-height:1.2;">'
        + '<div style="font-size:2rem;font-weight:900;color:var(--text-primary);">' + centerVal + '</div>'
        + '<div style="font-size:.7rem;color:var(--text-muted);margin-top:2px;max-width:85px;">' + centerSub + '</div>'
        + '</div></div>'
        + '<div style="flex:1;min-width:200px;max-width:300px;">'
        + '<div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-muted);margin-bottom:.65rem;">Distribución</div>'
        + (legend || '<div style="color:var(--text-muted);font-size:.8rem;padding:.5rem 0;">Sin actividad para este período.</div>')
        + '<div style="margin-top:.9rem;padding-top:.8rem;border-top:1px solid rgba(36,31,26,.06);">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:.35rem;">'
        + '<span style="font-size:.68rem;color:var(--text-muted);">Ocupación real · ' + WH_CAPACITY + ' slots</span>'
        + '<span style="font-size:.74rem;font-weight:700;color:' + barClr + ';">' + stockPct + '%</span>'
        + '</div>'
        + '<div style="background:rgba(36,31,26,.07);border-radius:4px;height:6px;overflow:hidden;">'
        + '<div style="width:' + stockPct + '%;background:' + barClr + ';height:100%;border-radius:4px;"></div>'
        + '</div>'
        + '<div style="font-size:.67rem;color:var(--text-muted);margin-top:.3rem;">'
        + state.products.length + ' ocupados · ' + (WH_CAPACITY - state.products.length) + ' libres</div>'
        + '</div></div></div>';
}

// ── Accordion: toggle helpers ─────────────────────────────────────────────────
function toggleOccAisle(aisle) {
    if (_occOpenAisles.has(aisle)) _occOpenAisles.delete(aisle);
    else _occOpenAisles.add(aisle);
    _renderOccAccordion();
}

function toggleOccCat(key) {
    if (_occOpenCats.has(key)) _occOpenCats.delete(key);
    else _occOpenCats.add(key);
    _renderOccAccordion();
}

function _renderOccAccordion() {
    const el = document.getElementById('occ-accordion');
    if (!el) return;

    let classification = [];
    try { classification = calculateABCClassification(); } catch (e) { }
    const classMap = {};
    classification.forEach(function (p) { classMap[p.id] = p.abcClass; });

    const rows = WH_GRID.aisles.map(function (aisle) {
        const prods = state.products.filter(function (p) { return p.aisle === aisle; });
        const isOpen = _occOpenAisles.has(aisle);
        const pct = Math.round((prods.length / WH_AISLE_CAP) * 100);
        const barClr = pct >= 90 ? '#A8442C' : pct >= 65 ? '#4A7AB5' : '#5E7D52';

        // Group by category
        const byCat = {};
        prods.forEach(function (p) {
            const cat = p.category || 'Sin categoría';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(p);
        });

        const catsHtml = Object.entries(byCat).map(function (entry) {
            const cat = entry[0], catProds = entry[1];
            const catKey = aisle + '::' + cat;
            const catOpen = _occOpenCats.has(catKey);

            const prodsHtml = catProds.map(function (p) {
                const abcCls = classMap[p.id] || 'C';
                const abcClr = OCC_ABC_CLR[abcCls];
                const stockLow = Number(p.stock) <= Number(p.threshold);
                const today = new Date().toISOString().split('T')[0];
                const expNear = p.expiry && p.expiry <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

                return `<div style="background:rgba(36,31,26,.04);border-radius:8px;padding:.75rem 1rem;margin:.3rem 0;border-left:3px solid ${abcClr};">
                    <div style="display:grid;grid-template-columns:90px 1fr 90px 1fr;gap:.3rem .6rem;font-size:.78rem;align-items:start;">
                        <span style="color:var(--text-muted);font-size:.72rem;">SKU</span>
                        <span style="font-family:monospace;font-weight:700;color:var(--text-primary);">${p.sku || '—'}</span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Clase ABC</span>
                        <span style="font-weight:700;color:${abcClr};">Clase ${abcCls}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Artículo</span>
                        <span style="font-weight:600;color:var(--text-primary);grid-column:2/5;">${escapeHtml(p.name)}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Marca</span>
                        <span>${p.brand || '—'}</span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Categoría</span>
                        <span>${p.category || '—'}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Stock</span>
                        <span style="font-weight:700;color:${stockLow ? '#A8442C' : 'var(--text-primary)'};">${p.stock} uds ${stockLow ? '⚠' : ''}</span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Precio unit.</span>
                        <span style="color:#5E7D52;font-weight:600;">${formatCurrency ? formatCurrency(p.price) : p.price}</span>

                        <span style="color:var(--text-muted);font-size:.72rem;">Ubicación</span>
                        <span>Pasillo <b>${p.aisle || '—'}</b> · Est.<b>${p.shelf || '—'}</b> · Niv.<b>${p.level || '—'}</b></span>
                        <span style="color:var(--text-muted);font-size:.72rem;">Alerta mín.</span>
                        <span style="color:${stockLow ? '#A8442C' : 'var(--text-muted)'};">${p.threshold} uds</span>

                        ${p.expiry ? `<span style="color:var(--text-muted);font-size:.72rem;">Vencimiento</span>
                        <span style="color:${expNear ? '#A8442C' : 'var(--text-secondary)'};">${p.expiry}${expNear ? ' ⚠ próximo' : ''}</span>` : ''}
                        ${p.lote ? `<span style="color:var(--text-muted);font-size:.72rem;">Lote</span>
                        <span>${p.lote}</span>` : ''}
                    </div>
                </div>`;
            }).join('');

            return `<div style="margin:.3rem 0 .3rem 1.2rem;">
                <div onclick="toggleOccCat('${catKey.replace(/'/g, "\\'")}')"
                     style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
                            padding:.48rem .8rem;background:rgba(36,31,26,.05);border-radius:7px;
                            border:1px solid rgba(36,31,26,.07);user-select:none;">
                    <div style="display:flex;align-items:center;gap:.5rem;">
                        <span style="font-size:.65rem;display:inline-block;transition:transform .2s;
                                     transform:${catOpen ? 'rotate(90deg)' : 'rotate(0deg)'};">▶</span>
                        <span style="font-size:.82rem;font-weight:600;color:var(--text-secondary);">${cat}</span>
                    </div>
                    <span style="font-size:.74rem;color:var(--text-muted);background:rgba(36,31,26,.06);
                                 padding:1px 8px;border-radius:10px;">${catProds.length} producto${catProds.length !== 1 ? 's' : ''}</span>
                </div>
                ${catOpen ? '<div style="margin:.25rem 0 .25rem .5rem;">' + prodsHtml + '</div>' : ''}
            </div>`;
        }).join('');

        return `<div style="margin-bottom:.5rem;border-radius:10px;border:1px solid rgba(36,31,26,.09);overflow:hidden;">
            <div onclick="toggleOccAisle('${aisle}')"
                 style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;
                        padding:.8rem 1.1rem;background:rgba(36,31,26,.06);user-select:none;">
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <span style="font-size:.75rem;display:inline-block;transition:transform .2s;
                                 transform:${isOpen ? 'rotate(90deg)' : 'rotate(0deg)'};">▶</span>
                    <span style="font-size:1.05rem;font-weight:900;color:${OCC_AISLE_CLR[aisle]};">Pasillo ${aisle}</span>
                    <span style="font-size:.78rem;color:var(--text-muted);">${prods.length} producto${prods.length !== 1 ? 's' : ''}</span>
                </div>
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <div style="background:rgba(36,31,26,.08);border-radius:4px;height:6px;width:80px;overflow:hidden;">
                        <div style="width:${Math.min(100, pct)}%;background:${barClr};height:100%;border-radius:4px;"></div>
                    </div>
                    <span style="font-size:.78rem;font-weight:700;color:${barClr};">${pct}%</span>
                    <span style="font-size:.74rem;color:var(--text-muted);">${WH_AISLE_CAP - prods.length} libres</span>
                </div>
            </div>
            ${isOpen ? '<div style="padding:.5rem .8rem .8rem;">' + (catsHtml || '<div style="color:var(--text-muted);font-size:.8rem;padding:.5rem;">Sin productos en este pasillo.</div>') + '</div>' : ''}
        </div>`;
    }).join('');

    el.innerHTML = rows;
}

// ── Main section renderer ─────────────────────────────────────────────────────
function renderOccupancySection() {
    const el = document.getElementById('dashboard-occupancy-section');
    if (!el) return;

    const d = computeOccupancyData();
    const stockPct = Math.min(100, Math.round((state.products.length / WH_CAPACITY) * 100));
    const genClr = stockPct >= 85 ? '#A8442C' : stockPct >= 60 ? '#4A7AB5' : '#5E7D52';
    const freeSlots = Math.max(0, WH_CAPACITY - state.products.length);

    const kpi = function (lbl, val, sub, clr) {
        return '<div style="background:var(--bg-secondary,#16162a);border-radius:10px;padding:1rem 1.2rem;border-left:3px solid ' + clr + ';">'
            + '<div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);font-weight:600;margin-bottom:.3rem;">' + lbl + '</div>'
            + '<div style="font-size:1.75rem;font-weight:900;color:' + clr + ';line-height:1;">' + val + '</div>'
            + '<div style="font-size:.74rem;color:var(--text-muted);margin-top:.3rem;">' + sub + '</div>'
            + '</div>';
    };


    const tabBase = 'padding:.45rem 1.1rem;border-radius:6px;border:1px solid;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .2s;';
    const filterBase = 'padding:.35rem .85rem;border-radius:5px;border:1px solid;font-size:.74rem;font-weight:600;cursor:pointer;transition:all .2s;';

    el.innerHTML =
        '<div class="card">'
        + '<div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1.25rem;">'
        + '<h2 class="card-title">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20" style="margin-right:.4rem;">'
        + '<rect x="2" y="3" width="6" height="10" rx="1"/><rect x="10" y="3" width="6" height="6" rx="1"/>'
        + '<rect x="10" y="13" width="6" height="8" rx="1"/><rect x="18" y="3" width="4" height="18" rx="1"/>'
        + '<rect x="2" y="17" width="6" height="4" rx="1"/></svg>'
        + 'Índices de Ocupación de Bodega</h2>'
        + '<span class="badge badge-info">' + state.products.length + ' / ' + WH_CAPACITY + ' posiciones</span>'
        + '</div>'

        // Mode selector
        + '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem;">'
        + '<span style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.25rem;">Vista:</span>'
        + "<button id=\"occ-mode-general\"  onclick=\"setOccMode('general')\"  style=\"" + tabBase + "\">General</button>"
        + "<button id=\"occ-mode-diario\"   onclick=\"setOccMode('diario')\"   style=\"" + tabBase + "\">Diario</button>"
        + "<button id=\"occ-mode-mensual\"  onclick=\"setOccMode('mensual')\"  style=\"" + tabBase + "\">Récord Mensual</button>"
        + '</div>'

        // Filter selector
        + '<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:1.4rem;">'
        + '<span style="font-size:.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.25rem;">Filtrar:</span>'
        + "<button id=\"occ-filter-todo\"      onclick=\"setOccFilter('todo')\"      style=\"" + filterBase + "\">Sin filtro</button>"
        + "<button id=\"occ-filter-pasillo\"   onclick=\"setOccFilter('pasillo')\"   style=\"" + filterBase + "\">Por Pasillo</button>"
        + "<button id=\"occ-filter-categoria\" onclick=\"setOccFilter('categoria')\" style=\"" + filterBase + "\">Por Categoría</button>"
        + "<button id=\"occ-filter-abc\"       onclick=\"setOccFilter('abc')\"       style=\"" + filterBase + "\">Por ABC</button>"
        + '</div>'

        // Chart area
        + '<div id="occ-chart-area" style="background:var(--bg-secondary,#16162a);border-radius:12px;padding:1rem 1.5rem;margin-bottom:1.5rem;"></div>'

        // KPI row
        + '<div class="wms-kpi-row" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.75rem;">'
        + kpi('Ocupación General', stockPct + '%', state.products.length + ' de ' + WH_CAPACITY + ' slots', genClr)
        + kpi('Despachos Hoy', d.dailyOrders, d.dailyUnits + ' uds · ' + new Date().toLocaleDateString('es-CO'), '#2E4A6E')
        + kpi('Récord Mensual', d.monthlyRecord + ' uds', 'Pico del mes · ' + d.recordDate, '#4A7AB5')
        + kpi('Posiciones Libres', freeSlots, freeSlots + ' de ' + WH_CAPACITY + ' disponibles', '#5E7D52')
        + '</div>'

        // Aisle accordion
        + '<div style="font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:.75rem;">Detalle por pasillo</div>'
        + '<div id="occ-accordion"></div>'
        + '</div>';

    _renderOccChart();
    _renderOccAccordion();
}

// ==========================================================================
//   MÓDULO: INDICADOR DE FRESCURA
// ==========================================================================

const FRESH_BUCKETS = [
    { key: 'expired', label: 'Vencido', color: '#7A2E1E' },
    { key: 'm3', label: '< 3 meses', color: '#A8442C' },
    { key: 'm6', label: '< 6 meses', color: '#C8932E' },
    { key: 'm9', label: '< 9 meses', color: '#C9A876' },
    { key: 'm12', label: '< 1 año', color: '#5E7D52' },
];

let _freshFilter = 'pasillo';
let _freshTimeRange = 'm3';
let _freshOpenGroups = new Set();

function setFreshFilter(f) { _freshFilter = f; _renderFreshAll(); }
function setFreshTimeRange(t) { _freshTimeRange = t; _renderFreshAll(); }
function toggleFreshGroup(key) {
    if (_freshOpenGroups.has(key)) _freshOpenGroups.delete(key);
    else _freshOpenGroups.add(key);
    _renderFreshAccordion();
}

function _getFreshBucket(expiryStr) {
    if (!expiryStr) return 'none';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryStr + 'T00:00:00');
    if (exp < today) return 'expired';
    const days = (exp - today) / 86400000;
    if (days < 90) return 'm3';
    if (days < 180) return 'm6';
    if (days < 270) return 'm9';
    if (days < 365) return 'm12';
    return 'ok';
}

function _buildFreshGroups() {
    const prods = state.products;
    const groups = {};
    if (_freshFilter === 'pasillo') {
        WH_GRID.aisles.forEach(function (a) { groups['Pasillo ' + a] = []; });
        prods.forEach(function (p) {
            const key = p.aisle ? 'Pasillo ' + p.aisle : 'Sin pasillo';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
    } else if (_freshFilter === 'categoria') {
        prods.forEach(function (p) {
            const key = p.category || 'Sin categoría';
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
    } else {
        var cls = [];
        try { cls = calculateABCClassification(); } catch (e) { }
        const classMap = {};
        cls.forEach(function (p) { classMap[p.id] = p.abcClass; });
        groups['Clase A'] = []; groups['Clase B'] = []; groups['Clase C'] = [];
        prods.forEach(function (p) {
            const key = 'Clase ' + (classMap[p.id] || 'C');
            groups[key].push(p);
        });
    }
    return Object.entries(groups).map(function (e) {
        const label = e[0], ps = e[1];
        const counts = { expired: 0, m3: 0, m6: 0, m9: 0, m12: 0, ok: 0, none: 0 };
        ps.forEach(function (p) { counts[_getFreshBucket(p.expiry)]++; });
        return { label: label, prods: ps, counts: counts, total: ps.length };
    }).filter(function (r) { return r.total > 0; });
}

function _renderFreshAll() {
    ['pasillo', 'categoria', 'abc'].forEach(function (f) {
        const btn = document.getElementById('fresh-filter-' + f);
        if (!btn) return;
        const on = _freshFilter === f;
        btn.style.background = on ? 'var(--primary,#2E4A6E)' : 'rgba(36,31,26,.04)';
        btn.style.color = on ? '#fff' : 'var(--text-secondary)';
        btn.style.borderColor = on ? 'transparent' : 'rgba(36,31,26,.1)';
    });
    FRESH_BUCKETS.forEach(function (b) {
        const btn = document.getElementById('fresh-time-' + b.key);
        if (!btn) return;
        const on = _freshTimeRange === b.key;
        btn.style.background = on ? b.color : 'rgba(36,31,26,.04)';
        btn.style.color = on ? '#fff' : 'var(--text-secondary)';
        btn.style.borderColor = on ? 'transparent' : 'rgba(36,31,26,.1)';
        btn.style.boxShadow = on ? '0 0 0 2px ' + b.color + '55' : 'none';
    });
    _renderFreshChart();
    _renderFreshAccordion();
}

function _renderFreshChart() {
    const chartEl = document.getElementById('fresh-chart-area');
    if (!chartEl) return;
    const groups = _buildFreshGroups();
    if (groups.length === 0) {
        chartEl.innerHTML = '<div style="color:var(--text-muted);font-size:.85rem;padding:.75rem 0;">Sin productos registrados.</div>';
        return;
    }
    const bucket = FRESH_BUCKETS.find(function (b) { return b.key === _freshTimeRange; }) || FRESH_BUCKETS[0];
    const maxCount = Math.max(1, groups.reduce(function (m, g) { return Math.max(m, g.counts[_freshTimeRange] || 0); }, 0));
    const html = groups.map(function (row) {
        const count = row.counts[_freshTimeRange] || 0;
        const pct = row.total > 0 ? Math.round((count / row.total) * 100) : 0;
        const barW = (count / maxCount) * 100;
        const inner = count > 0
            ? '<div style="width:' + barW.toFixed(1) + '%;background:' + bucket.color
            + ';height:100%;border-radius:5px;display:flex;align-items:center;padding:0 .55rem;'
            + 'font-size:.72rem;font-weight:700;color:rgba(36,31,26,.95);white-space:nowrap;'
            + 'overflow:hidden;transition:width .35s;">'
            + (barW > 10 ? count + ' · ' + pct + '%' : '') + '</div>'
            : '<div style="height:100%;display:flex;align-items:center;padding:0 .55rem;">'
            + '<span style="font-size:.7rem;color:var(--text-muted);">ninguno</span></div>';
        return '<div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;">'
            + '<div style="min-width:110px;text-align:right;font-size:.79rem;font-weight:600;'
            + 'color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + row.label + '</div>'
            + '<div style="flex:1;background:rgba(36,31,26,.06);border-radius:5px;height:26px;overflow:hidden;">' + inner + '</div>'
            + '<div style="min-width:72px;font-size:.77rem;color:var(--text-muted);">'
            + (count > 0 ? '<span style="font-weight:700;color:' + bucket.color + ';">' + count + '</span> / ' + row.total : '0 / ' + row.total)
            + '</div></div>';
    }).join('');
    chartEl.innerHTML = html;
}

function _renderFreshAccordion() {
    const el = document.getElementById('fresh-accordion');
    if (!el) return;
    const groups = _buildFreshGroups();
    const html = groups.map(function (row) {
        const isOpen = _freshOpenGroups.has(row.label);
        const urgCount = (row.counts['expired'] || 0) + (row.counts['m3'] || 0);
        const urgBadge = urgCount > 0
            ? '<span style="font-size:.64rem;font-weight:700;background:#A8442C;color:#fff;'
            + 'border-radius:10px;padding:1px 7px;margin-left:.4rem;">'
            + urgCount + ' urgente' + (urgCount !== 1 ? 's' : '') + '</span>'
            : '';
        const sorted = row.prods.slice().sort(function (a, b) {
            if (!a.expiry && !b.expiry) return 0;
            if (!a.expiry) return 1;
            if (!b.expiry) return -1;
            return a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0;
        });
        const prodsHtml = sorted.map(function (p) {
            const bk = _getFreshBucket(p.expiry);
            const bCfg = FRESH_BUCKETS.find(function (b) { return b.key === bk; });
            const bClr = bCfg ? bCfg.color : (bk === 'ok' ? '#5E7D52' : '#6b7280');
            const bLbl = bCfg ? bCfg.label : (bk === 'ok' ? '> 1 año' : 'Sin venc.');
            let daysLabel = '';
            if (p.expiry) {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const days = Math.round((new Date(p.expiry + 'T00:00:00') - today) / 86400000);
                daysLabel = days < 0 ? 'Vencido hace ' + Math.abs(days) + 'd'
                    : days === 0 ? '¡Vence hoy!'
                        : 'Vence en ' + days + 'd';
            }
            return '<div style="background:rgba(36,31,26,.04);border-radius:8px;padding:.6rem .9rem;'
                + 'margin:.25rem 0;border-left:3px solid ' + bClr + ';">'
                + '<div style="display:grid;grid-template-columns:85px 1fr 85px 1fr;gap:.22rem .55rem;font-size:.76rem;">'
                + '<span style="color:var(--text-muted);font-size:.7rem;">SKU</span>'
                + '<span style="font-family:monospace;font-weight:700;">' + (p.sku || '—') + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Frescura</span>'
                + '<span style="font-weight:700;color:' + bClr + ';">' + bLbl + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Artículo</span>'
                + '<span style="font-weight:600;grid-column:2/5;color:var(--text-primary);">' + p.name + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Vencimiento</span>'
                + '<span style="color:' + bClr + ';font-weight:600;">' + (p.expiry || '—') + (daysLabel ? ' · ' + daysLabel : '') + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Lote</span>'
                + '<span>' + (p.lote || '—') + '</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Stock</span>'
                + '<span style="font-weight:700;">' + p.stock + ' uds</span>'
                + '<span style="color:var(--text-muted);font-size:.7rem;">Ubicación</span>'
                + '<span>P.' + (p.aisle || '—') + ' · Est.' + (p.shelf || '—') + ' · Niv.' + (p.level || '—') + '</span>'
                + '</div></div>';
        }).join('');
        // Use data-key attribute to avoid quote nesting in onclick
        const safeLabel = row.label.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        return '<div style="margin-bottom:.45rem;border-radius:10px;border:1px solid rgba(36,31,26,.08);overflow:hidden;">'
            + '<div data-gkey="' + safeLabel + '" onclick="var k=this.dataset.gkey;toggleFreshGroup(k)" '
            + 'style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;'
            + 'padding:.75rem 1.1rem;background:rgba(36,31,26,.05);user-select:none;">'
            + '<div style="display:flex;align-items:center;gap:.6rem;">'
            + '<span style="font-size:.7rem;display:inline-block;transition:transform .2s;'
            + 'transform:' + (isOpen ? 'rotate(90deg)' : 'rotate(0deg)') + ';">►</span>'
            + '<span style="font-size:.9rem;font-weight:700;color:var(--text-primary);">' + row.label + '</span>'
            + urgBadge + '</div>'
            + '<span style="font-size:.75rem;color:var(--text-muted);">' + row.total + ' producto' + (row.total !== 1 ? 's' : '') + '</span>'
            + '</div>'
            + (isOpen ? '<div style="padding:.4rem .75rem .75rem;">' + prodsHtml + '</div>' : '')
            + '</div>';
    }).join('');
    el.innerHTML = html || '<div style="color:var(--text-muted);font-size:.82rem;padding:.5rem;">Sin productos.</div>';
}

function seedTestExpiryDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = [
        { days: -45, weight: 5 },
        { days: -10, weight: 5 },
        { days: 12, weight: 8 },
        { days: 55, weight: 10 },
        { days: 85, weight: 10 },
        { days: 120, weight: 13 },
        { days: 165, weight: 12 },
        { days: 230, weight: 12 },
        { days: 310, weight: 13 },
        { days: 430, weight: 7 },
        { days: 600, weight: 5 },
    ];
    const pool = [];
    buckets.forEach(function (b) { for (var i = 0; i < b.weight; i++) pool.push(b.days); });
    state.products.forEach(function (p, idx) {
        const base = pool[idx % pool.length];
        const jitter = Math.floor(Math.random() * 14) - 7;
        const d = new Date(today);
        d.setDate(d.getDate() + base + jitter);
        p.expiry = d.toISOString().split('T')[0];
    });
    saveState();
    renderFreshnessSection();
}

function renderFreshnessSection() {
    const el = document.getElementById('dashboard-freshness-section');
    if (!el) return;
    const withExpiry = state.products.filter(function (p) { return !!p.expiry; }).length;
    const expired = state.products.filter(function (p) { return _getFreshBucket(p.expiry) === 'expired'; }).length;
    const critical = state.products.filter(function (p) { return _getFreshBucket(p.expiry) === 'm3'; }).length;
    const tabBase = 'padding:.42rem 1rem;border-radius:6px;border:1px solid;font-size:.77rem;font-weight:600;cursor:pointer;transition:all .2s;';
    const timeBase = 'padding:.38rem .9rem;border-radius:6px;border:1px solid;font-size:.76rem;font-weight:700;cursor:pointer;transition:all .2s;';
    el.innerHTML = '<div class="card">'
        + '<div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1.25rem;">'
        + '<h2 class="card-title">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20" style="margin-right:.4rem;">'
        + '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
        + 'Indicador de Frescura de Inventario</h2>'
        + '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;">'
        + '<span class="badge badge-info">' + withExpiry + ' con fecha</span>'
        + (expired > 0 ? '<span class="badge" style="background:rgba(127,29,29,.4);color:#fca5a5;border:1px solid #7f1d1d;">' + expired + ' vencido' + (expired !== 1 ? 's' : '') + '</span>' : '')
        + (critical > 0 ? '<span class="badge" style="background:rgba(168,68,44,.15);color:#A8442C;border:1px solid rgba(168,68,44,.5);">' + critical + ' crítico' + (critical !== 1 ? 's' : '') + '</span>' : '')
        + '<button onclick="seedTestExpiryDates()" style="margin-left:.5rem;padding:.3rem .8rem;border-radius:6px;border:1px dashed rgba(36,31,26,.25);background:rgba(36,31,26,.04);color:var(--text-muted);font-size:.72rem;cursor:pointer;" title="Asigna fechas de vencimiento de prueba a todos los productos">⚗ Cargar fechas de prueba</button>'
        + '</div></div>'
        + '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.8rem;">'
        + '<span style="font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.2rem;">Ver por:</span>'
        + '<button id="fresh-filter-pasillo"   data-val="pasillo"   onclick="setFreshFilter(this.dataset.val)"   style="' + tabBase + '">Por Pasillo</button>'
        + '<button id="fresh-filter-categoria" data-val="categoria" onclick="setFreshFilter(this.dataset.val)"   style="' + tabBase + '">Por Categoría</button>'
        + '<button id="fresh-filter-abc"       data-val="abc"       onclick="setFreshFilter(this.dataset.val)"   style="' + tabBase + '">Por ABC</button>'
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;margin-bottom:1.25rem;">'
        + '<span style="font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-right:.2rem;">Temporalidad:</span>'
        + '<button id="fresh-time-expired" data-val="expired" onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">Vencido</button>'
        + '<button id="fresh-time-m3"      data-val="m3"      onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 3 meses</button>'
        + '<button id="fresh-time-m6"      data-val="m6"      onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 6 meses</button>'
        + '<button id="fresh-time-m9"      data-val="m9"      onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 9 meses</button>'
        + '<button id="fresh-time-m12"     data-val="m12"     onclick="setFreshTimeRange(this.dataset.val)" style="' + timeBase + '">&lt; 1 año</button>'
        + '</div>'
        + '<div id="fresh-chart-area" style="margin-bottom:1.5rem;"></div>'
        + '<div style="font-size:.73rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;'
        + 'color:var(--text-muted);margin-bottom:.7rem;">Detalle de productos · orden FEFO</div>'
        + '<div id="fresh-accordion"></div>'
        + '</div>';
    _renderFreshAll();
}
// --- DASHBOARD RENDERING LOGIC ---
function renderDashboard() {
    // 1. Calculate stats metrics
    const totalRevenue = state.invoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);

    const totalInvoices = state.invoices.length;
    const totalStock = state.products.reduce((sum, prod) => sum + Number(prod.stock), 0);
    const totalAlerts = state.products.filter(prod => Number(prod.stock) <= Number(prod.threshold)).length;

    // 2. Write numbers to HTML
    document.getElementById("stat-revenue").innerText = formatCurrency(totalRevenue);
    document.getElementById("stat-invoice-count").innerText = totalInvoices;
    document.getElementById("stat-total-stock").innerText = totalStock;
    document.getElementById("stat-alerts").innerText = totalAlerts;

    // Modify critical alert label visual style depending on level
    const alertLabel = document.getElementById("stat-alerts-severity");
    if (totalAlerts > 0) {
        alertLabel.innerText = "Stock Crítico";
        alertLabel.className = "stat-trend down";
    } else {
        alertLabel.innerText = "Sin Alertas";
        alertLabel.className = "stat-trend up";
    }
    // 3. Render recent invoices feed
    renderRecentInvoicesFeed();

    // 4. Render weekly billing chart with real data
    renderWeeklyChart();

    // 5. Render occupancy indices
    renderOccupancySection();

    // 6. Render freshness indicator
    renderFreshnessSection();
}

function renderRecentInvoicesFeed() {
    const listContainer = document.getElementById("dashboard-recent-invoices");
    listContainer.innerHTML = "";

    // Sort descending by date
    const sortedInvoices = [...state.invoices].slice(-4).reverse();

    if (sortedInvoices.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay registros de transacciones.</div>`;
        return;
    }

    sortedInvoices.forEach(inv => {
        const item = document.createElement("div");
        item.className = `activity-item ${inv.status === 'paid' ? 'invoice-paid' : 'invoice-pending'}`;

        let statusIcon = '';
        if (inv.status === 'paid') {
            statusIcon = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else {
            statusIcon = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
        }

        // Format date
        const invDate = new Date(inv.date);
        const dayStr = invDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });

        item.innerHTML = `
            <div class="activity-details">
                <div class="activity-icon-box">
                    ${statusIcon}
                </div>
                <div class="activity-text-info">
                    <span class="activity-title">${escapeHtml(inv.clientName)}</span>
                    <span class="activity-time">${inv.id} &bull; ${dayStr}</span>
                </div>
            </div>
            <span class="activity-value">${formatCurrency(inv.total)}</span>
        `;

        listContainer.appendChild(item);
    });
}

// --- WEEKLY BILLING CHART ENGINE ---
function generateSmoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpX = (prev.x + curr.x) / 2;
        d += ` C ${cpX},${prev.y} ${cpX},${curr.y} ${curr.x},${curr.y}`;
    }
    return d;
}

function renderWeeklyChart() {
    const Y_BASE = 170;
    const Y_TOP = 20;
    const X_POSITIONS = [40, 110, 180, 250, 320, 390, 460];
    const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const DAY_LABELS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    // Get Monday of the current week
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    // Build date strings for this week and last week
    const thisWeekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().split('T')[0];
    });
    const lastWeekDates = thisWeekDates.map(dateStr => {
        const d = new Date(dateStr);
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });

    // Sum paid invoice totals per day
    const sumByDate = (dates) => dates.map(dateStr =>
        state.invoices
            .filter(inv => inv.date === dateStr && inv.status === 'paid')
            .reduce((sum, inv) => sum + inv.total, 0)
    );

    const dayTotals = sumByDate(thisWeekDates);
    const lastWeekTotals = sumByDate(lastWeekDates);

    const maxVal = Math.max(...dayTotals, 1);

    // Map totals to SVG Y coordinates (higher value = lower Y number)
    const points = X_POSITIONS.map((x, i) => ({
        x,
        y: dayTotals[i] > 0
            ? Math.round(Y_BASE - ((dayTotals[i] / maxVal) * (Y_BASE - Y_TOP)))
            : Y_BASE,
        val: dayTotals[i]
    }));

    // Generate and apply paths
    const linePath = generateSmoothPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${Y_BASE} L ${points[0].x} ${Y_BASE} Z`;

    document.getElementById('chart-main-path').setAttribute('d', linePath);
    document.getElementById('chart-glow-path').setAttribute('d', linePath);
    document.getElementById('chart-area-path').setAttribute('d', areaPath);

    // Update dots position and tooltip callbacks
    const dots = document.querySelectorAll('#dashboard-trend-svg .chart-dot');
    dots.forEach((dot, i) => {
        if (i >= points.length) return;
        dot.setAttribute('cx', points[i].x);
        dot.setAttribute('cy', points[i].y);
        dot.setAttribute('data-val', points[i].val);
        dot.setAttribute('onclick',
            `showChartValue(this, '${DAY_LABELS_FULL[i]}', '${formatCurrency(points[i].val)}')`
        );
    });

    // Update X-axis day labels
    const textNodes = document.querySelectorAll('#dashboard-trend-svg text');
    textNodes.forEach((t, i) => {
        if (i < DAY_LABELS_SHORT.length) t.textContent = DAY_LABELS_SHORT[i];
    });

    // Update week range badge
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    document.getElementById('chart-legend-date').innerText = `${fmt(monday)} – ${fmt(sunday)}`;

    // Update revenue trend % vs last week
    const thisTotal = dayTotals.reduce((a, b) => a + b, 0);
    const lastTotal = lastWeekTotals.reduce((a, b) => a + b, 0);
    const trendEl = document.getElementById('stat-revenue-trend');
    if (trendEl) {
        let pctText, isUp;
        if (lastTotal > 0) {
            const pct = ((thisTotal - lastTotal) / lastTotal * 100).toFixed(1);
            isUp = Number(pct) >= 0;
            pctText = `${isUp ? '+' : ''}${pct}%`;
        } else if (thisTotal > 0) {
            isUp = true;
            pctText = '+100%';
        } else {
            isUp = true;
            pctText = '0%';
        }
        trendEl.className = `stat-trend ${isUp ? 'up' : 'down'}`;
        trendEl.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none">
                <polyline points="${isUp ? '18 15 12 9 6 15' : '18 9 12 15 6 9'}" />
            </svg>
            ${pctText}`;
    }
}

// --- INTERACTIVE CHART ENGINE ---
function setupChartTooltipInteraction() {
    const chartTooltip = document.getElementById("chart-tooltip");
    const tooltipDay = document.getElementById("tooltip-day");
    const tooltipVal = document.getElementById("tooltip-val");

    window.showChartValue = function (element, day, val) {
        const rect = element.getBoundingClientRect();
        const containerRect = element.closest('.chart-container').getBoundingClientRect();

        tooltipDay.innerText = day;
        tooltipVal.innerText = val;

        // Position relative to chart-container
        chartTooltip.style.left = `${rect.left - containerRect.left - 40}px`;
        chartTooltip.style.top = `${rect.top - containerRect.top - 45}px`;
        chartTooltip.style.display = "block";

        // Light flash effect on selected dot
        document.querySelectorAll(".chart-dot").forEach(dot => {
            dot.setAttribute("r", "5");
            dot.style.fill = "var(--accent-gold)";
        });
        element.setAttribute("r", "7.5");
        element.style.fill = "var(--text-primary)";
    };

    // Close tooltip clicking outside
    document.addEventListener("click", (e) => {
        if (!e.target.classList.contains("chart-dot")) {
            chartTooltip.style.display = "none";
        }
    });
}

// --- INVENTORY MANAGEMENT DRIVER ---
let inventorySearchQuery = "";
let inventoryCategoryFilter = "all";

function renderInventory() {
    const tableBody = document.getElementById("inventory-table-body");
    tableBody.innerHTML = "";

    const filteredProducts = state.products.filter(prod => {
        const matchesSearch = prod.name.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
            prod.sku.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
            prod.brand.toLowerCase().includes(inventorySearchQuery.toLowerCase());
        const matchesCategory = inventoryCategoryFilter === 'all' || prod.category === inventoryCategoryFilter;
        return matchesSearch && matchesCategory;
    });

    if (filteredProducts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No se encontraron mercancías ni herramientas registradas.
                </td>
            </tr>
        `;
        return;
    }

    filteredProducts.forEach(prod => {
        const tr = document.createElement("tr");

        // Stock status identification
        let badgeClass = 'badge-success';
        let badgeLabel = 'Operativo';
        let pct = (prod.stock / 50) * 100; // max reference 50 items
        if (pct > 100) pct = 100;

        let fillStyle = 'background: var(--accent-emerald-gradient);';

        if (Number(prod.stock) === 0) {
            badgeClass = 'badge-danger';
            badgeLabel = 'Agotado';
            fillStyle = 'background: var(--accent-rose-gradient);';
        } else if (Number(prod.stock) <= Number(prod.threshold)) {
            badgeClass = 'badge-warning';
            badgeLabel = 'Stock Crítico';
            fillStyle = 'background: var(--accent-gold-gradient);';
        }

        // Dynamic icons based on industrial category
        let categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

        if (prod.category === 'Herramientas Eléctricas') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`; // Lightning bolt
        } else if (prod.category === 'Consumibles') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`; // Grinding disc / Globe
        } else if (prod.category === 'Herramientas Manuales') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`; // Wrench
        } else if (prod.category === 'Fijaciones') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v15M10 14h4M9 9h6"/></svg>`; // Screw / Bolt
        } else if (prod.category === 'Maquinaria Pesada') {
            categorySvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>`; // Machine box
        }

        // Calculate remaining shelf life / inspection in days
        let shelfLifeText = 'Sin límite';
        let shelfLifeClass = 'badge-info';

        if (prod.expDate) {
            const expDateObj = new Date(prod.expDate + 'T00:00:00');
            const currentDate = new Date();
            expDateObj.setHours(0, 0, 0, 0);
            currentDate.setHours(0, 0, 0, 0);

            const diffTime = expDateObj.getTime() - currentDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                shelfLifeText = `Reinspección Vencida (${Math.abs(diffDays)} d)`;
                shelfLifeClass = 'badge-danger';
            } else if (diffDays === 0) {
                shelfLifeText = 'Calibrar Hoy';
                shelfLifeClass = 'badge-warning';
            } else {
                shelfLifeText = `${diffDays} d p/inspección`;
                shelfLifeClass = diffDays <= 60 ? 'badge-warning' : 'badge-success';
            }
        }

        const fabFormatted = prod.mfgDate ? prod.mfgDate : 'N/D';
        const vencFormatted = prod.expDate ? prod.expDate : 'N/D';
        const lotFormatted = prod.lot ? prod.lot : 'N/D';

        tr.innerHTML = `
            <td style="font-family:'JetBrains Mono',monospace;font-weight:700;font-size:0.82rem;white-space:nowrap;color:var(--text-primary);">
                ${prod.sku || '—'}
            </td>
            <td>
                <div class="product-cell">
                    <div class="product-image-placeholder">
                        ${categorySvg}
                    </div>
                    <div class="product-meta-info">
                        <span class="product-name">${prod.name}</span>
                        <span class="product-sku"><strong style="color:var(--accent-gold);font-size:0.7rem;">${prod.brand}</strong></span>
                    </div>
                </div>
            </td>
            <td style="font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 0.85rem;">
                ${lotFormatted}
            </td>
            <td>
                <span style="font-weight: 600; font-family:'Rajdhani'; font-size: 0.95rem;">${prod.category}</span>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary);">
                ${formatCurrency(prod.price)}
            </td>
            <td>
                <div class="stock-bar-container">
                    <div class="stock-bar-label">
                        <span style="font-weight:700;">${prod.stock} uds</span>
                        <span style="color: var(--text-muted); font-size: 0.75rem;">${Math.round(pct)}%</span>
                    </div>
                    <div class="stock-bar-track">
                        <div class="stock-bar-fill" style="width: ${pct}%; ${fillStyle}"></div>
                    </div>
                </div>
            </td>
            <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; line-height: 1.4;">
                <div style="color: var(--text-secondary);">Rec: ${fabFormatted}</div>
                <div style="color: var(--accent-gold);">Ctrl: ${vencFormatted}</div>
            </td>
            <td>
                <span class="badge ${shelfLifeClass}">${shelfLifeText}</span>
            </td>
            <td>
                <span class="badge ${badgeClass}">${badgeLabel}</span>
            </td>
            <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                    <button class="btn btn-secondary btn-icon-only" onclick="openProductModal('${prod.id}')" title="Modificar Ficha">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
                    </button>
                    <button class="btn btn-danger btn-icon-only" onclick="deleteProduct('${prod.id}')" title="Dar de Baja">
                        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            </td>
        `;

        tableBody.appendChild(tr);
    });
}

function filterInventory() {
    inventorySearchQuery = document.getElementById("inventory-search").value;
    inventoryCategoryFilter = document.getElementById("inventory-category-filter").value;
    renderInventory();
}

function deleteProduct(id) {
    const prod = state.products.find(p => p.id === id);
    if (!prod) return;

    if (confirm(`¿Estás seguro de que deseas dar de baja el artículo "${prod.name}" del catálogo central?`)) {
        state.products = state.products.filter(p => p.id !== id);
        saveProductsToStorage();
        renderInventory();
        triggerToast("success", `Artículo "${escapeHtml(prod.name)}" eliminado correctamente.`);
    }
}

// --- PRODUCT CREATION / EDIT MODAL LOGIC ---
function openProductModal(productId = null) {
    const modal = document.getElementById("product-modal");
    const modalTitle = document.getElementById("product-modal-title");
    const form = document.getElementById("product-form");

    form.reset();
    document.getElementById("product-modal-id").value = "";

    if (productId) {
        // Mode: EDIT
        const prod = state.products.find(p => p.id === productId);
        if (!prod) return;

        modalTitle.innerText = "Modificar Ficha Técnica del Artículo";
        document.getElementById("product-modal-id").value = prod.id;
        document.getElementById("product-modal-name").value = prod.name;
        document.getElementById("product-modal-sku").value = prod.sku;
        document.getElementById("product-modal-category").value = prod.category;
        document.getElementById("product-modal-price").value = prod.price;
        document.getElementById("product-modal-stock").value = prod.stock;
        document.getElementById("product-modal-threshold").value = prod.threshold;

        // Additional batch & expiry details
        document.getElementById("product-modal-lot").value = prod.lot || "";
        document.getElementById("product-modal-mfg-date").value = prod.mfgDate || "";
        document.getElementById("product-modal-exp-date").value = prod.expDate || "";

        // WMS Location & Brand fields
        document.getElementById("product-modal-warehouse").value = prod.warehouse || "Bodega Principal";
        document.getElementById("product-modal-aisle").value = prod.aisle || "C";
        document.getElementById("product-modal-shelf").value = prod.shelf || 1;
        document.getElementById("product-modal-level").value = prod.level || 1;
        document.getElementById("product-modal-distance").value = prod.pickingDistance || 25;
        document.getElementById("product-modal-brand").value = prod.brand || "";
        document.getElementById("product-modal-supplier").value = prod.supplier || "";
    } else {
        // Mode: CREATE
        modalTitle.innerText = "Registrar Nuevo Suministro Industrial";

        // Auto-generate cool default SKU
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        document.getElementById("product-modal-sku").value = `SKU-VF-${randomNum}`;

        // Auto-generate default Lot number
        const randomLot = Math.floor(100 + Math.random() * 900);
        document.getElementById("product-modal-lot").value = `LT-${randomLot}`;

        // Default manufacturing/reception date to today's date
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById("product-modal-mfg-date").value = todayStr;

        // Default calibration inspection date to 1 year from now
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        const nextYearStr = nextYear.toISOString().split('T')[0];
        document.getElementById("product-modal-exp-date").value = nextYearStr;
    }

    modal.classList.add("active");
}

function closeProductModal() {
    document.getElementById("product-modal").classList.remove("active");
}

function saveProductForm(event) {
    event.preventDefault();

    const id = document.getElementById("product-modal-id").value;
    const name = document.getElementById("product-modal-name").value;
    const sku = document.getElementById("product-modal-sku").value;
    const category = document.getElementById("product-modal-category").value;
    const price = parseFloat(document.getElementById("product-modal-price").value);
    const stock = parseInt(document.getElementById("product-modal-stock").value);
    const threshold = parseInt(document.getElementById("product-modal-threshold").value);

    // Read batch and expiry inputs
    const lot = document.getElementById("product-modal-lot").value;
    const mfgDate = document.getElementById("product-modal-mfg-date").value;
    const expDate = document.getElementById("product-modal-exp-date").value;

    // Read WMS location & brand inputs
    const warehouse = document.getElementById("product-modal-warehouse").value;
    const aisle = document.getElementById("product-modal-aisle").value;
    const shelf = parseInt(document.getElementById("product-modal-shelf").value) || 1;
    const level = parseInt(document.getElementById("product-modal-level").value) || 1;
    const pickingDistance = parseInt(document.getElementById("product-modal-distance").value) || 25;
    const brand = document.getElementById("product-modal-brand").value;
    const supplier = document.getElementById("product-modal-supplier").value;

    const productData = { name, sku, category, price, stock, threshold, lot, mfgDate, expDate, warehouse, aisle, shelf, level, pickingDistance, brand, supplier };

    if (id) {
        // Edit existing product
        const index = state.products.findIndex(p => p.id === id);
        if (index !== -1) {
            state.products[index] = { id, ...productData };
            triggerToast("success", `Artículo "${escapeHtml(name)}" actualizado con éxito.`);
        }
    } else {
        // Create new product
        state.products.push({ id: Date.now().toString(), ...productData });
        triggerToast("success", `Artículo "${escapeHtml(name)}" ingresado correctamente.`);
    }

    saveProductsToStorage();
    closeProductModal();
    renderInventory();
}

// --- DYNAMIC INVOICING ENGINE ---
// Reset active builder state to default draft values
function initializeInvoiceBuilder() {
    state.invoiceItems = [];

    // Inject the current proforma number dynamically
    const nextFactNum = `FACT-${new Date().getFullYear()}-${String(state.invoices.length + 1).padStart(4, '0')}`;
    document.getElementById("preview-invoice-number").innerText = nextFactNum;

    // Default client parameters reset
    document.getElementById("invoice-client-name").value = "Juan Díaz";
    document.getElementById("invoice-client-id").value = "CC 79.845.922";

    // Genera un CUFE simulado (código único de facturación electrónica DIAN)
    updateSimulatedCufe();

    document.getElementById("invoice-discount").value = "0";
    document.getElementById("invoice-tax-rate").value = "19";
}

// Genera un CUFE simulado (Código Único de Factura Electrónica de la DIAN).
// NOTA: es un valor de DEMOSTRACIÓN — no aplica el algoritmo SHA-384 oficial
// sobre los campos reales de la factura ni firma con el certificado del
// facturador. Sirve para mostrar cómo se vería la facturación electrónica.
function updateSimulatedCufe() {
    const cufeEl = document.getElementById("preview-cufe");
    if (!cufeEl) return;
    const num = document.getElementById("preview-invoice-number").innerText;
    const seed = `${num}|${Date.now()}|${state.settings.taxId || ''}`;
    // Hash simple determinístico → cadena hex de 96 chars (formato visual del CUFE)
    let hex = '';
    for (let i = 0; i < 96; i++) {
        let h = 0;
        const s = seed + i;
        for (let c = 0; c < s.length; c++) { h = (h * 31 + s.charCodeAt(c)) & 0xffff; }
        hex += (h & 0xf).toString(16);
    }
    cufeEl.innerText = hex;
}

function populateProductSelector() {
    const selector = document.getElementById("invoice-product-selector");
    selector.innerHTML = "";

    // Load products with stock available
    const inStock = state.products.filter(p => p.stock > 0);

    if (inStock.length === 0) {
        selector.innerHTML = `<option value="">No hay suministros disponibles (Stock Agotado)</option>`;
        return;
    }

    inStock.forEach(prod => {
        const option = document.createElement("option");
        option.value = prod.id;
        option.innerText = `${prod.name} (${formatCurrency(prod.price)} - stock: ${prod.stock})`;
        selector.appendChild(option);
    });
}

function addInvoiceItem() {
    const selector = document.getElementById("invoice-product-selector");
    const qtyInput = document.getElementById("invoice-product-qty");

    const productId = selector.value;
    const qty = parseInt(qtyInput.value);

    if (!productId || qty <= 0) {
        triggerToast("error", "Por favor selecciona un artículo y cantidad válida.");
        return;
    }

    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    // Stock boundary condition checks
    const currentQtyInBuilder = state.invoiceItems
        .filter(item => item.productId === productId)
        .reduce((sum, item) => sum + item.qty, 0);

    if (qty + currentQtyInBuilder > product.stock) {
        triggerToast("error", `Existencias insuficientes en patio. Máximo disponible: ${product.stock} uds.`);
        return;
    }

    // Check if product already exists in item builder
    const existingIndex = state.invoiceItems.findIndex(item => item.productId === productId);
    if (existingIndex !== -1) {
        state.invoiceItems[existingIndex].qty += qty;
    } else {
        state.invoiceItems.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            qty: qty
        });
    }

    qtyInput.value = "1";
    triggerToast("success", `Despachando: ${qty}x ${escapeHtml(product.name)}`);

    renderInvoiceBuilderItems();
    calculateInvoiceTotals();
}

function removeInvoiceItem(productId) {
    state.invoiceItems = state.invoiceItems.filter(item => item.productId !== productId);
    renderInvoiceBuilderItems();
    calculateInvoiceTotals();
}

function changeBuilderItemQty(productId, newQty) {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty <= 0) return;

    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    if (qty > product.stock) {
        triggerToast("error", `Existencias insuficientes. Límite: ${product.stock}`);
        renderInvoiceBuilderItems();
        return;
    }

    const index = state.invoiceItems.findIndex(item => item.productId === productId);
    if (index !== -1) {
        state.invoiceItems[index].qty = qty;
    }

    calculateInvoiceTotals();
    updateInvoicePreview();
}

function renderInvoiceBuilderItems() {
    const tbody = document.getElementById("invoice-builder-items");
    tbody.innerHTML = "";

    if (state.invoiceItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
                    El comprobante no tiene conceptos registrados.
                </td>
            </tr>
        `;
        return;
    }

    state.invoiceItems.forEach(item => {
        const tr = document.createElement("tr");
        const itemTotal = item.price * item.qty;

        tr.innerHTML = `
            <td>
                <span style="font-weight:600; display:block; color: var(--text-primary);">${escapeHtml(item.name)}</span>
            </td>
            <td style="text-align: center;">
                <div class="quantity-control">
                    <input type="number" class="qty-input" value="${item.qty}" min="1" 
                           onchange="changeBuilderItemQty('${item.productId}', this.value)">
                </div>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem;">
                ${formatCurrency(item.price)}
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight:600; color:var(--text-primary); font-size: 0.9rem;">
                ${formatCurrency(itemTotal)}
            </td>
            <td style="text-align: right;">
                <button class="btn btn-secondary btn-icon-only" onclick="removeInvoiceItem('${item.productId}')" style="border-color: rgba(255,42,95,0.15); color: var(--accent-rose);">
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function calculateInvoiceTotals() {
    const subtotal = state.invoiceItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discountPct = parseFloat(document.getElementById("invoice-discount").value);
    const discountVal = subtotal * (discountPct / 100);
    const subtotalWithDisc = subtotal - discountVal;

    const taxRate = parseFloat(document.getElementById("invoice-tax-rate").value);
    const taxVal = subtotalWithDisc * (taxRate / 100);
    const grandTotal = subtotalWithDisc + taxVal;

    // Save draft temporary totals
    state.currentCalculations = {
        subtotal,
        discountPct,
        discountVal,
        taxRate,
        taxVal,
        grandTotal
    };

    // Redraw live preview
    updateInvoicePreview();
}

function updateInvoicePreview() {
    const clientName = document.getElementById("invoice-client-name").value || "Consumidor Final";
    const clientId = document.getElementById("invoice-client-id").value || "N/A";

    document.getElementById("preview-client-name").innerText = clientName;
    document.getElementById("preview-client-id").innerText = clientId;

    const calc = state.currentCalculations || { subtotal: 0, discountPct: 0, discountVal: 0, taxRate: 19, taxVal: 0, grandTotal: 0 };

    document.getElementById("preview-subtotal").innerText = formatCurrency(calc.subtotal);
    document.getElementById("preview-discount-label").innerText = `Descuento (${calc.discountPct}%)`;
    document.getElementById("preview-discount-val").innerText = `-${formatCurrency(calc.discountVal)}`;
    document.getElementById("preview-tax-label").innerText = `I.V.A (${calc.taxRate}%)`;
    document.getElementById("preview-tax-val").innerText = formatCurrency(calc.taxVal);
    document.getElementById("preview-grand-total").innerText = formatCurrency(calc.grandTotal);

    // Render dynamic listing on ticket receipt
    const receiptItemsContainer = document.getElementById("preview-items-list");
    receiptItemsContainer.innerHTML = "";

    if (state.invoiceItems.length === 0) {
        receiptItemsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 1.75rem 0;">Esperando códigos en cinta...</div>`;
        return;
    }

    state.invoiceItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "summary-item-row";
        row.innerHTML = `
            <div>
                <div class="summary-item-name">${escapeHtml(item.name)}</div>
                <div class="summary-item-qty-price">${item.qty} uds x ${formatCurrency(item.price)}</div>
            </div>
            <div class="summary-item-total">${formatCurrency(item.price * item.qty)}</div>
        `;
        receiptItemsContainer.appendChild(row);
    });
}

function commitInvoiceTransaction() {
    if (state.invoiceItems.length === 0) {
        triggerToast("error", "No se puede despachar una factura vacía sin conceptos.");
        return;
    }

    const clientName = document.getElementById("invoice-client-name").value;
    const clientId = document.getElementById("invoice-client-id").value;

    if (!clientName.trim()) {
        triggerToast("error", "Por favor ingresa una razón social o cliente válido.");
        return;
    }

    const calc = state.currentCalculations;
    const invoiceId = document.getElementById("preview-invoice-number").innerText;
    const todayStr = new Date().toISOString().split('T')[0];

    // Create definitive invoice model
    const definitiveInvoice = {
        id: invoiceId,
        clientName,
        clientId,
        date: todayStr,
        items: [...state.invoiceItems],
        subtotal: calc.subtotal,
        discountPct: calc.discountPct,
        discountVal: calc.discountVal,
        taxRate: calc.taxRate,
        taxVal: calc.taxVal,
        total: calc.grandTotal,
        status: "paid"
    };

    // Deduct stock quantities from inventory state
    state.invoiceItems.forEach(item => {
        const productIndex = state.products.findIndex(p => p.id === item.productId);
        if (productIndex !== -1) {
            state.products[productIndex].stock = Math.max(0, state.products[productIndex].stock - item.qty);
        }
    });

    // Insert into state and persist
    state.invoices.push(definitiveInvoice);
    saveInvoicesToStorage();
    saveProductsToStorage();

    // Generar automáticamente la lista de preparación de pedido (picking)
    const newList = generatePickingFromInvoice(definitiveInvoice, { silent: true });

    triggerToast("success", `Despacho ${invoiceId} procesado. Lista de preparación ${newList ? newList.id : ''} creada.`);

    // Reset invoice builder
    initializeInvoiceBuilder();
    renderInvoiceBuilderItems();
    calculateInvoiceTotals();

    // Redirect to dashboard to check transaction
    setTimeout(() => {
        switchTab('dashboard');
    }, 1200);
}

// ==========================================================================
//   ABC CLASSIFICATION & WAREHOUSE OPTIMIZATION ENGINE (PARETO)
// ==========================================================================

/**
 * Main ABC View orchestrator — called when the logistics tab is active.
 * Reads filter values, computes classification, and renders all sub-views.
 */
function renderABCView() {
    // Fallback: si por cualquier razón el estado está vacío, sembrar demo
    if (state.products.length === 0) {
        state.products = [...DEMO_PRODUCTS];
        saveProductsToStorage();
    }
    if (state.invoices.length === 0) {
        state.invoices = [...DEMO_INVOICES];
        saveInvoicesToStorage();
    }

    console.log('[WMS] productos:', state.products.length, '| facturas:', state.invoices.length);
    const classification = calculateABCClassification();
    console.log('[WMS] clasificados:', classification.length, '| mal ubicados:', classification.filter(p => p.isMisplaced).length);

    // --- Update KPI stat cards ---
    const classA = classification.filter(p => p.abcClass === 'A');
    const classB = classification.filter(p => p.abcClass === 'B');
    const classC = classification.filter(p => p.abcClass === 'C');

    document.getElementById('abc-count-a').innerText = classA.length;
    document.getElementById('abc-count-b').innerText = classB.length;
    document.getElementById('abc-count-c').innerText = classC.length;

    // Revenue participation % (real Pareto metric, not product count %)
    const totalRevenue = classification.reduce((sum, p) => sum + p.salesRevenue, 0) || 1;
    document.getElementById('abc-pct-a').innerText = ((classA.reduce((s, p) => s + p.salesRevenue, 0) / totalRevenue) * 100).toFixed(1) + '%';
    document.getElementById('abc-pct-b').innerText = ((classB.reduce((s, p) => s + p.salesRevenue, 0) / totalRevenue) * 100).toFixed(1) + '%';
    document.getElementById('abc-pct-c').innerText = ((classC.reduce((s, p) => s + p.salesRevenue, 0) / totalRevenue) * 100).toFixed(1) + '%';

    // Efficiency: how many products are in the right zone?
    const misplaced = classification.filter(p => p.isMisplaced);
    const total = classification.length;
    const efficiency = total > 0 ? (((total - misplaced.length) / total) * 100).toFixed(0) : 100;
    document.getElementById('abc-warehouse-efficiency').innerText = efficiency + '%';

    const misplacedEl = document.getElementById('abc-misplaced-count');
    misplacedEl.innerText = `${misplaced.length} mal ubicados`;
    misplacedEl.className = misplaced.length > 0 ? 'stat-trend down' : 'stat-trend up';

    // --- Render sub-components ---
    renderWarehouseHeatmap(classification);
    renderParetoChart(classification);
    renderABCRecommendations(classification);
    renderABCTable(classification);
    renderManualRelocation();
}

/**
 * Core ABC Score Calculator
 * Scores each product using weighted Pareto formula:
 *   Score = 0.40 * FrequencyNorm + 0.25 * QuantityNorm + 0.20 * RevenueNorm + 0.15 * RotationNorm
 *
 * Then classifies: top ~80% cumulative score → A, next ~15% → B, rest → C
 */
function calculateABCClassification() {
    // --- Read filter controls ---
    const warehouseFilter = document.getElementById('abc-warehouse').value;
    const categoryFilter = document.getElementById('abc-category').value;

    // Filter products
    let products = state.products.filter(p => {
        const matchWarehouse = warehouseFilter === 'all' || p.warehouse === warehouseFilter;
        const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
        return matchWarehouse && matchCategory;
    });

    if (products.length === 0) return [];

    // --- Apply period filter to invoices ---
    const periodVal = document.getElementById('abc-period').value;
    const periodDays = { semanal: 7, mensual: 30, trimestral: 90, anual: 365 };
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (periodDays[periodVal] || 30));
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // --- Gather sales data from invoices within the selected period ---
    const salesMap = {}; // productId → { frequency, quantity, revenue }
    state.invoices.forEach(inv => {
        if (inv.status !== 'paid') return;
        if (inv.date < cutoffStr) return;
        inv.items.forEach(item => {
            if (!salesMap[item.productId]) {
                salesMap[item.productId] = { frequency: 0, quantity: 0, revenue: 0 };
            }
            salesMap[item.productId].frequency += 1;
            salesMap[item.productId].quantity += item.qty;
            salesMap[item.productId].revenue += item.price * item.qty;
        });
    });

    // --- Compute raw metrics for each product ---
    const enriched = products.map(p => {
        const sales = salesMap[p.id] || { frequency: 0, quantity: 0, revenue: 0 };

        // Rotation index: how fast stock cycles (higher = more rotation)
        const rotation = p.stock > 0 ? (sales.quantity / p.stock) : (sales.quantity > 0 ? sales.quantity : 0);

        return {
            ...p,
            salesFrequency: sales.frequency,
            salesQuantity: sales.quantity,
            salesRevenue: sales.revenue,
            rotation: rotation
        };
    });

    // --- Normalize each metric (linear 0 → 100) ---
    const maxFreq = Math.max(...enriched.map(p => p.salesFrequency), 1);
    const maxQty = Math.max(...enriched.map(p => p.salesQuantity), 1);
    const maxRev = Math.max(...enriched.map(p => p.salesRevenue), 1);
    const maxRot = Math.max(...enriched.map(p => p.rotation), 0.01);

    enriched.forEach(p => {
        const normFreq = (p.salesFrequency / maxFreq) * 100;
        const normQty = (p.salesQuantity / maxQty) * 100;
        const normRev = (p.salesRevenue / maxRev) * 100;
        const normRot = (p.rotation / maxRot) * 100;

        // Weighted Score (Pareto)
        p.abcScore = (0.40 * normFreq) + (0.25 * normQty) + (0.20 * normRev) + (0.15 * normRot);
    });

    // --- Sort descending by Score ---
    enriched.sort((a, b) => b.abcScore - a.abcScore);

    // --- Classify using cumulative % thresholds ---
    const totalScore = enriched.reduce((sum, p) => sum + p.abcScore, 0);

    if (totalScore === 0) {
        // No invoice data in period — classify by physical aisle instead of Pareto
        const aisleClass = { A: 'A', B: 'B', C: 'C', D: 'C' };
        enriched.forEach(p => {
            p.abcClass = aisleClass[p.aisle] || 'C';
            p.cumulativePct = 100;
        });
    } else {
        let cumulative = 0;
        enriched.forEach(p => {
            cumulative += p.abcScore;
            const cumulativePct = (cumulative / totalScore) * 100;
            p.cumulativePct = cumulativePct;
            if (cumulativePct <= 80) {
                p.abcClass = 'A';
            } else if (cumulativePct <= 95) {
                p.abcClass = 'B';
            } else {
                p.abcClass = 'C';
            }
        });
    }

    // --- Determine misplacement ---
    // Class A: debe estar en pasillo A o B (dist ≤ 20m)
    // Class B: debe estar en pasillo B o C (dist ≤ 28m)
    // Class C: no debe ocupar espacio premium de pasillo A (dist > 18m)
    const aisleOrder = { A: 1, B: 2, C: 3, D: 4 };
    enriched.forEach(p => {
        const dist = p.pickingDistance || 25;
        const aisleRank = aisleOrder[p.aisle] || 3;

        if (p.abcClass === 'A' && (aisleRank > 2 || dist > 20)) {
            p.isMisplaced = true;
            p.misplacedReason = `Artículo crítico Clase A ("${p.name.split(' ').slice(0, 2).join(' ')}") ubicado en ${p.aisle ? 'Pasillo ' + p.aisle : 'zona lejana'} a ${dist}m de despacho. Mover a zona acelerada (Pasillo A/B, ≤ 20m) para optimizar el picking diario.`;
            p.suggestedAisle = 'A';
        } else if (p.abcClass === 'B' && (aisleRank === 1 || aisleRank > 3 || dist > 28)) {
            p.isMisplaced = true;
            p.misplacedReason = `Artículo media rotación Clase B ("${p.name.split(' ').slice(0, 2).join(' ')}") mal posicionado en ${p.aisle ? 'Pasillo ' + p.aisle : 'zona incorrecta'} a ${dist}m. Reubicar a pasillo intermedio (Pasillo B/C, ≤ 28m).`;
            p.suggestedAisle = 'B';
        } else if (p.abcClass === 'C' && (aisleRank <= 1 || dist <= 18)) {
            p.isMisplaced = true;
            p.misplacedReason = `Artículo baja rotación Clase C ("${p.name.split(' ').slice(0, 2).join(' ')}") ocupa espacio premium en ${p.aisle ? 'Pasillo ' + p.aisle : 'zona delantera'} a ${dist}m. Liberar estante rápido y reubicar a Pasillo C/D (> 25m).`;
            p.suggestedAisle = 'D';
        } else {
            p.isMisplaced = false;
            p.misplacedReason = '';
            p.suggestedAisle = '';
        }
    });

    return enriched;
}

/**
 * Renders the 2D warehouse floor plan heatmap.
 * 4 columns (Aisles A–D), each containing shelves.
 * Each shelf cell is color-coded by the highest-priority product stored there.
 */
function renderWarehouseHeatmap(classification) {
    const gridContainer = document.getElementById('warehouse-grid-map');
    gridContainer.innerHTML = '';

    const aisles = ['A', 'B', 'C', 'D'];
    const aisleLabels = {
        'A': 'Pasillo A · EPP y Consumibles',
        'B': 'Pasillo B · Bahía Herramientas',
        'C': 'Pasillo C · Bahía Fijaciones',
        'D': 'Pasillo D · Patio Carga Pesada'
    };

    aisles.forEach(aisleId => {
        const aisleColumn = document.createElement('div');
        aisleColumn.className = 'warehouse-aisle-column';

        // Aisle header
        aisleColumn.innerHTML = `<div class="warehouse-aisle-header">${aisleLabels[aisleId]}</div>`;

        // Shelves container
        const shelvesContainer = document.createElement('div');
        shelvesContainer.className = 'warehouse-shelves-container';

        // Find all products in this aisle
        const aisleProducts = classification.filter(p => p.aisle === aisleId);

        // Group by shelf number
        const shelfMap = {};
        aisleProducts.forEach(p => {
            const key = p.shelf || 1;
            if (!shelfMap[key]) shelfMap[key] = [];
            shelfMap[key].push(p);
        });

        // Render up to 5 shelf slots per aisle
        const maxShelves = 5;
        for (let s = 1; s <= maxShelves; s++) {
            const slot = document.createElement('div');
            slot.className = 'warehouse-rack-slot';

            const productsOnShelf = shelfMap[s] || [];

            if (productsOnShelf.length === 0) {
                slot.classList.add('slot-empty');
                slot.innerHTML = `<span class="rack-slot-meta">Bahía ${s} · Libre</span>`;
            } else {
                // Use highest priority (A > B > C) product to color the slot
                const priorityOrder = { 'A': 0, 'B': 1, 'C': 2 };
                productsOnShelf.sort((a, b) => priorityOrder[a.abcClass] - priorityOrder[b.abcClass]);
                const primary = productsOnShelf[0];

                slot.classList.add(`slot-class-${primary.abcClass.toLowerCase()}`);
                slot.style.cursor = 'pointer';

                if (productsOnShelf.some(p => p.isMisplaced)) {
                    slot.classList.add('slot-misplaced');
                }

                slot.innerHTML = `
                    <span class="rack-slot-title">Clase ${primary.abcClass}</span>
                    <span class="rack-slot-meta">${productsOnShelf.length} SKU${productsOnShelf.length > 1 ? 's' : ''} &bull; Bahía ${s}</span>
                `;

                slot.addEventListener('click', () => openSlotModal(aisleId, s, productsOnShelf));
            }

            shelvesContainer.appendChild(slot);
        }

        aisleColumn.appendChild(shelvesContainer);
        gridContainer.appendChild(aisleColumn);
    });

    // Update warehouse label
    const warehouseFilter = document.getElementById('abc-warehouse').value;
    document.getElementById('heatmap-warehouse-label').innerText = warehouseFilter === 'all' ? 'Todos los Depósitos' : warehouseFilter;
}

// --- WMS Slot Modal ---
const _aisleLabels = {
    A: 'Pasillo A · EPP y Consumibles',
    B: 'Pasillo B · Bahía Herramientas',
    C: 'Pasillo C · Bahía Fijaciones',
    D: 'Pasillo D · Patio Carga Pesada'
};
const _abcColors = { A: 'var(--accent-emerald)', B: '#4A7AB5', C: 'var(--accent-rose)' };

function openSlotModal(aisleId, shelf, products) {
    let modal = document.getElementById('wms-slot-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wms-slot-modal';
        modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);align-items:center;justify-content:center;';
        modal.innerHTML = `<div id="wms-slot-modal-box" style="background:#F7F3EA;border:1px solid var(--border-accent);border-radius:var(--radius-lg);padding:1.75rem;width:min(480px,92vw);max-height:80vh;overflow-y:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.6);">
            <button onclick="closeSlotModal()" style="position:absolute;top:1rem;right:1rem;background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:1.3rem;line-height:1;">&#x2715;</button>
            <div id="wms-slot-modal-content"></div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) closeSlotModal(); });
        document.body.appendChild(modal);
    }

    const hasMisplaced = products.some(p => p.isMisplaced);
    const content = document.getElementById('wms-slot-modal-content');
    content.innerHTML = `
        <div style="margin-bottom:1.25rem;">
            <div style="font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:0.2rem;">
                Estantería ${aisleId}${shelf}
            </div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${_aisleLabels[aisleId] || 'Pasillo ' + aisleId} &bull; Bahía ${shelf}</div>
            ${hasMisplaced ? `<div style="margin-top:0.6rem;display:inline-flex;align-items:center;gap:0.4rem;background:rgba(255,42,95,0.08);color:var(--accent-rose);border:1px solid rgba(255,42,95,0.2);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.75rem;font-weight:700;">⚠️ Contiene productos desalineados</div>` : `<div style="margin-top:0.6rem;display:inline-flex;align-items:center;gap:0.4rem;background:rgba(0,255,135,0.07);color:var(--accent-emerald);border:1px solid rgba(0,255,135,0.2);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.75rem;font-weight:700;">✅ Ubicación óptima</div>`}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
            ${products.map(p => `
                <div style="background:rgba(36,31,26,0.04);border:1px solid var(--border-subtle);border-left:3px solid ${_abcColors[p.abcClass]};border-radius:var(--radius-sm);padding:0.85rem 1rem;">
                    <div style="font-weight:700;font-size:0.9rem;color:var(--text-primary);margin-bottom:0.5rem;">${escapeHtml(p.name)}</div>
                    <div class="kv-grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:0.35rem 1rem;font-size:0.78rem;color:var(--text-secondary);">
                        <span>Clase ABC <strong style="color:${_abcColors[p.abcClass]};">Clase ${p.abcClass}</strong></span>
                        <span>Score <strong style="color:var(--text-primary);">${p.abcScore.toFixed(1)}</strong></span>
                        <span>SKU <strong style="color:var(--text-primary);">${p.sku || '—'}</strong></span>
                        <span>Stock <strong style="color:var(--text-primary);">${p.stock ?? '—'} uds</strong></span>
                        <span>Distancia <strong style="color:var(--text-primary);">${p.pickingDistance}m</strong></span>
                        <span>Estado <strong style="${p.isMisplaced ? 'color:var(--accent-rose)' : 'color:var(--accent-emerald)'};">${p.isMisplaced ? '⚠️ Desalineado' : '✅ Correcto'}</strong></span>
                    </div>
                    ${p.isMisplaced ? `<div style="margin-top:0.6rem;display:flex;align-items:center;gap:0.5rem;padding-top:0.6rem;border-top:1px solid var(--border-subtle);">
                        <span style="font-size:0.75rem;color:var(--text-muted);">Reubicar a</span>
                        <span style="background:rgba(0,255,135,0.07);color:var(--accent-emerald);border:1px solid rgba(0,255,135,0.2);border-radius:20px;padding:0.15rem 0.65rem;font-size:0.75rem;font-weight:700;">Pasillo ${p.suggestedAisle}</span>
                        <button class="btn btn-primary btn-sm" style="font-size:0.72rem;padding:.25rem .7rem;margin-left:auto;" onclick="applyOneRelocation('${p.id}','${p.suggestedAisle}');closeSlotModal();">Aplicar</button>
                    </div>` : ''}
                </div>
            `).join('')}
        </div>
    `;

    modal.style.display = 'flex';
}

function closeSlotModal() {
    const modal = document.getElementById('wms-slot-modal');
    if (modal) modal.style.display = 'none';
}

/**
 * Renders the Pareto SVG chart with:
 * - Colored bars (green=A, blue=B, red=C) showing individual scores
 * - Cumulative % line overlay
 * - 80%/95% threshold lines
 */
function renderParetoChart(classification) {
    const svg = document.getElementById('abc-pareto-svg');
    if (!svg) return;
    svg.innerHTML = '';

    if (classification.length === 0) {
        svg.innerHTML = `<text x="250" y="140" fill="var(--text-muted)" font-size="14" text-anchor="middle">No hay suficientes transacciones para el gráfico de Pareto.</text>`;
        return;
    }

    const viewWidth = 500;
    const viewHeight = 280;
    const padding = { top: 30, right: 55, bottom: 40, left: 55 };
    const chartW = viewWidth - padding.left - padding.right;
    const chartH = viewHeight - padding.top - padding.bottom;

    // Acumulamos todo el markup en un string y lo asignamos UNA sola vez al final
    // (evita reparsear el SVG completo en cada concatenación — mucho más rápido)
    let svgParts = '';

    const maxScore = Math.max(...classification.map(p => p.abcScore), 1);
    const n = classification.length;
    const barGap = 4;
    const barWidth = Math.max(8, Math.min(50, (chartW - barGap * n) / n));

    // --- Draw grid lines ---
    for (let pct = 0; pct <= 100; pct += 25) {
        const y = padding.top + chartH - (pct / 100) * chartH;
        svgParts += `<line class="pareto-axis" x1="${padding.left}" y1="${y}" x2="${viewWidth - padding.right}" y2="${y}" />`;
        svgParts += `<text class="pareto-label" x="${padding.left - 8}" y="${y + 3}" text-anchor="end">${pct}%</text>`;
    }

    // --- Draw 80% and 95% threshold horizontal dashed lines ---
    const y80 = padding.top + chartH - (80 / 100) * chartH;
    const y95 = padding.top + chartH - (95 / 100) * chartH;
    svgParts += `<line x1="${padding.left}" y1="${y80}" x2="${viewWidth - padding.right}" y2="${y80}" stroke="var(--accent-emerald)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.6" />`;
    svgParts += `<text x="${viewWidth - padding.right + 4}" y="${y80 + 3}" fill="var(--accent-emerald)" font-size="9" font-weight="700">80%</text>`;
    svgParts += `<line x1="${padding.left}" y1="${y95}" x2="${viewWidth - padding.right}" y2="${y95}" stroke="var(--accent-cyan)" stroke-width="1.2" stroke-dasharray="5,4" opacity="0.6" />`;
    svgParts += `<text x="${viewWidth - padding.right + 4}" y="${y95 + 3}" fill="var(--accent-cyan)" font-size="9" font-weight="700">95%</text>`;

    // --- Draw bars and build line points ---
    let linePoints = [];
    let dotElements = '';

    classification.forEach((p, i) => {
        const x = padding.left + i * (barWidth + barGap) + barGap / 2;
        const barH = (p.abcScore / maxScore) * chartH;
        const barY = padding.top + chartH - barH;

        const classColor = p.abcClass === 'A' ? 'bar-class-a' : p.abcClass === 'B' ? 'bar-class-b' : 'bar-class-c';

        svgParts += `<rect class="pareto-bar ${classColor}" x="${x}" y="${barY}" width="${barWidth}" height="${barH}" rx="3">
            <title>${escapeHtml(p.name)}\nScore ABC: ${p.abcScore.toFixed(1)} &bull; Clase ${p.abcClass}</title>
        </rect>`;

        // X-axis label (truncated name) — solo etiquetas espaciadas para evitar solape;
        // el nombre completo queda en el tooltip de la barra.
        const labelStep = Math.max(1, Math.ceil(n / 9));
        if (i % labelStep === 0) {
            const shortName = p.name.split(' ').slice(0, 1).join('').substring(0, 8);
            const lx = x + barWidth / 2;
            const ly = viewHeight - padding.bottom + 13;
            svgParts += `<text class="pareto-label" x="${lx}" y="${ly}" text-anchor="end" font-size="8" transform="rotate(-45 ${lx} ${ly})">${shortName}</text>`;
        }

        // Cumulative line point
        const lineY = padding.top + chartH - (p.cumulativePct / 100) * chartH;
        const lineX = x + barWidth / 2;
        linePoints.push(`${lineX},${lineY}`);

        dotElements += `<circle class="pareto-line-dot" cx="${lineX}" cy="${lineY}" r="4">
            <title>${escapeHtml(p.name)} &bull; Acumulado: ${p.cumulativePct.toFixed(1)}%</title>
        </circle>`;
    });

    // --- Draw cumulative line ---
    if (linePoints.length > 1) {
        svgParts += `<polyline class="pareto-line" points="${linePoints.join(' ')}" />`;
    }
    svgParts += dotElements;

    // --- Axis labels ---
    svgParts += `<text x="${viewWidth / 2}" y="${viewHeight - 5}" fill="var(--text-muted)" font-size="10" text-anchor="middle" font-weight="700">Artículos (Ordenados por rotación)</text>`;
    svgParts += `<text x="12" y="${viewHeight / 2}" fill="var(--text-muted)" font-size="10" text-anchor="middle" transform="rotate(-90 12 ${viewHeight / 2})" font-weight="700">% Acumulado</text>`;

    // Asignación única — un solo reflow en lugar de ~30
    svg.innerHTML = svgParts;
}

/**
 * Renders intelligent relocation recommendation cards.
 * Only shows products that are misplaced.
 */
function renderABCRecommendations(classification) {
    const container = document.getElementById('abc-recommendations-list');
    const btnArea = document.getElementById('abc-rec-btn-area');
    container.innerHTML = '';

    const misplaced = classification.filter(p => p.isMisplaced);

    if (btnArea) {
        btnArea.innerHTML = misplaced.length > 0
            ? `<button class="btn btn-primary btn-sm" onclick="applyAllSuggestedRelocations()"
                style="white-space:nowrap;">
                ⚡ Aplicar todas (${misplaced.length})
               </button>`
            : '';
    }

    if (misplaced.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
                <svg viewBox="0 0 24 24" width="40" height="40" stroke="var(--accent-emerald)" stroke-width="2" fill="none" style="margin-bottom: 1rem;">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.35rem; font-family:'Syne';">Bahías Optimizadas</p>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Todas las herramientas y cargas están en su pasillo óptimo.</p>
            </div>
        `;
        return;
    }

    const arrowSvg = `<svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

    const aisleNames = {
        A: 'Pasillo A · EPP y Consumibles',
        B: 'Pasillo B · Bahía Herramientas',
        C: 'Pasillo C · Bahía Fijaciones',
        D: 'Pasillo D · Patio Carga Pesada'
    };

    misplaced.forEach(p => {
        const card = document.createElement('div');
        card.className = 'abc-recommendation-card';
        const tagClass = p.abcClass === 'A' ? 'tag-high' : p.abcClass === 'B' ? 'tag-medium' : 'tag-low';
        const tagLabel = p.abcClass === 'A' ? 'Acelerado / Clase A' : p.abcClass === 'B' ? 'Media Rotación / Clase B' : 'Bajo Rotación / Clase C';
        const fromLabel = aisleNames[p.aisle] || `Pasillo ${p.aisle}`;
        const toLabel = aisleNames[p.suggestedAisle] || `Pasillo ${p.suggestedAisle}`;

        // Determinar causa del desalineado
        const aisleOrder = { A: 1, B: 2, C: 3, D: 4 };
        const aisleRank = aisleOrder[p.aisle] || 3;
        const dist = p.pickingDistance || 25;
        const expectedMaxAisle = p.abcClass === 'A' ? 2 : p.abcClass === 'B' ? 3 : 99;
        const aisleMismatch = p.abcClass === 'C' ? aisleRank <= 1 : aisleRank > expectedMaxAisle;
        const distMismatch = (p.abcClass === 'A' && dist > 20) || (p.abcClass === 'B' && dist > 28) || (p.abcClass === 'C' && dist <= 18);

        const causeBadges = [];
        if (aisleMismatch) causeBadges.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(255,42,95,0.08);color:var(--accent-rose);border:1px solid rgba(255,42,95,0.2);border-radius:4px;padding:0.15rem 0.5rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Pasillo incorrecto</span>`);
        if (distMismatch) causeBadges.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(192,138,45,0.08);color:var(--accent-gold);border:1px solid rgba(192,138,45,0.2);border-radius:4px;padding:0.15rem 0.5rem;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Distancia excesiva</span>`);

        card.innerHTML = `
            <div class="abc-rec-header">
                <span class="abc-rec-tag ${tagClass}">${tagLabel}</span>
                <span style="font-family:'JetBrains Mono';font-size:0.78rem;color:var(--text-muted);font-weight:600;">Score: ${p.abcScore.toFixed(1)}</span>
            </div>
            <div class="abc-rec-product-name">${escapeHtml(p.name)}</div>
            ${causeBadges.length ? `<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:0.4rem 0;">${causeBadges.join('')}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:0.6rem;gap:.5rem;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;gap:.5rem;">
                    <span style="background:rgba(192,138,45,0.10);color:var(--accent-gold);border:1px solid rgba(192,138,45,0.25);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.78rem;font-weight:700;font-family:'Rajdhani';text-transform:uppercase;letter-spacing:0.5px;">Pasillo ${p.aisle}</span>
                    ${arrowSvg}
                    <span style="background:rgba(0,255,135,0.07);color:var(--accent-emerald);border:1px solid rgba(0,255,135,0.2);border-radius:20px;padding:0.2rem 0.75rem;font-size:0.78rem;font-weight:700;font-family:'Rajdhani';text-transform:uppercase;letter-spacing:0.5px;">Pasillo ${p.suggestedAisle}</span>
                </div>
                <button class="btn btn-primary btn-sm" style="font-size:0.75rem;padding:.3rem .8rem;"
                    onclick="applyOneRelocation('${p.id}', '${p.suggestedAisle}')">
                    Aplicar esta
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Distance (m) reference by aisle — used when auto-relocating
const AISLE_DIST = { A: 9, B: 15, C: 24, D: 34 };

function _applyRelocationToProduct(productId, targetAisle) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return false;
    const prevAisle = product.aisle;
    product.aisle = targetAisle;
    product.pickingDistance = AISLE_DIST[targetAisle] || product.pickingDistance;
    // Update the location string used in picking
    if (product.location) {
        product.location = `${targetAisle}-${product.shelf || 1}`;
    }
    logWMSRelocation(product, prevAisle, targetAisle, 'WMS Automático');
    return true;
}

function logWMSRelocation(product, fromAisle, toAisle, by) {
    if (!state.wmsLog) state.wmsLog = [];
    state.wmsLog.unshift({
        ts: Date.now(),
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        fromAisle,
        toAisle,
        fromShelf: product.shelf,
        toShelf: product.shelf,
        by
    });
    if (state.wmsLog.length > 200) state.wmsLog.length = 200;
    localStorage.setItem('aura_wms_log', JSON.stringify(state.wmsLog));
}

function applyAllSuggestedRelocations() {
    const classification = calculateABCClassification();
    const misplaced = classification.filter(p => p.isMisplaced);
    if (misplaced.length === 0) { triggerToast('info', 'No hay productos mal ubicados.'); return; }
    let applied = 0;
    misplaced.forEach(p => { if (_applyRelocationToProduct(p.id, p.suggestedAisle)) applied++; });
    saveProductsToStorage();
    triggerToast('success', `${applied} producto(s) reubicados automáticamente por WMS.`);
    renderABCView();
}

function applyOneRelocation(productId, targetAisle) {
    if (_applyRelocationToProduct(productId, targetAisle)) {
        saveProductsToStorage();
        const product = state.products.find(p => p.id === productId);
        triggerToast('success', `${escapeHtml(product?.name?.split(' ').slice(0, 3).join(' '))} → Pasillo ${targetAisle}.`);
        renderABCView();
    }
}

// --- WMS Log load on startup ---
function loadWMSLog() {
    try { state.wmsLog = JSON.parse(localStorage.getItem('aura_wms_log') || '[]'); }
    catch { state.wmsLog = []; }
}

// ── REUBICACIÓN MANUAL ──────────────────────────────────────────────────────
let _wmsEditId = null;   // product being edited inline
let _wmsSearch = '';     // current search filter in manual table

function renderManualRelocation() {
    const section = document.getElementById('wms-manual-section');
    if (!section) return;

    const warehouses = [...new Set(state.products.map(p => p.warehouse).filter(Boolean))];
    const aisles = ['A', 'B', 'C', 'D'];

    const filtered = state.products.filter(p => {
        if (!_wmsSearch) return true;
        const q = _wmsSearch.toLowerCase();
        return (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.aisle || '').toLowerCase().includes(q);
    });

    const rows = filtered.map(p => {
        const isEditing = _wmsEditId === p.id;
        const rowBg = isEditing ? 'background:var(--bg-secondary,#16162a);' : '';

        const displayRow = `
            <tr id="wms-row-${p.id}" style="${rowBg}">
                <td style="font-family:monospace;font-size:0.8rem;">${p.sku || '—'}</td>
                <td>
                    <div style="font-weight:600;font-size:0.88rem;">${escapeHtml(p.name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);">${p.category || ''}</div>
                </td>
                <td style="font-size:0.82rem;">${p.warehouse || '—'}</td>
                <td style="text-align:center;font-size:1.1rem;font-weight:900;color:var(--accent-cyan,#2E4A6E);">${p.aisle || '—'}</td>
                <td style="text-align:center;font-weight:600;">${p.shelf || '—'}</td>
                <td style="text-align:center;">${p.level || '—'}</td>
                <td style="text-align:center;font-size:0.8rem;">${p.pickingDistance ?? '—'} m</td>
                <td style="text-align:right;">
                    ${isEditing
                ? `<button class="btn btn-danger btn-sm" onclick="_wmsEditId=null;renderManualRelocation()">✕ Cancelar</button>`
                : `<button class="btn btn-primary btn-sm" onclick="_wmsEditId='${p.id}';renderManualRelocation()">✎ Mover</button>`
            }
                </td>
            </tr>
            ${isEditing ? `
            <tr id="wms-edit-${p.id}" style="background:var(--bg-secondary,#16162a);">
                <td colspan="8" style="padding:.75rem 1rem 1rem;">
                    <div style="background:var(--bg-card,#1a1a30);border:1px solid var(--accent-cyan,#2E4A6E);border-radius:10px;padding:1rem 1.25rem;">
                        <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-cyan,#2E4A6E);margin-bottom:.9rem;">
                            Nueva ubicación para: <em style="color:var(--text-primary);">${escapeHtml(p.name)}</em>
                        </div>
                        <div class="resp-collapse-600" style="display:grid;grid-template-columns:2fr 100px 80px 80px 110px;gap:.75rem;align-items:end;">
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Bodega</label>
                                <select class="form-select" id="wms-e-wh">
                                    ${warehouses.map(w => `<option value="${w}" ${w === p.warehouse ? 'selected' : ''}>${w}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Pasillo</label>
                                <select class="form-select" id="wms-e-aisle">
                                    ${aisles.map(a => `<option value="${a}" ${a === p.aisle ? 'selected' : ''}>${a}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Estante</label>
                                <input type="number" class="form-input" id="wms-e-shelf" value="${p.shelf || 1}" min="1" max="20">
                            </div>
                            <div class="form-group" style="margin:0;">
                                <label class="form-label">Nivel</label>
                                <input type="number" class="form-input" id="wms-e-level" value="${p.level || 1}" min="1" max="5">
                            </div>
                            <div style="display:flex;gap:.5rem;">
                                <button class="btn btn-primary" style="flex:1;" onclick="saveManualRelocation('${p.id}')">
                                    ✓ Guardar
                                </button>
                            </div>
                        </div>
                        <div style="margin-top:.6rem;font-size:0.75rem;color:var(--text-muted);">
                            Distancia estimada nueva:
                            <strong id="wms-e-dist-preview" style="color:var(--accent-gold);">
                                ${AISLE_DIST[p.aisle] || p.pickingDistance} m
                            </strong>
                            &nbsp;— La distancia se recalcula al cambiar el pasillo.
                        </div>
                    </div>
                </td>
            </tr>` : ''}`;
        return displayRow;
    }).join('');

    // WMS Log (last 10 entries)
    const log = (state.wmsLog || []).slice(0, 10);
    const logRows = log.length === 0
        ? `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1.5rem 0;">Sin movimientos registrados.</td></tr>`
        : log.map(e => {
            const d = new Date(e.ts);
            return `<tr>
                <td style="font-size:0.78rem;color:var(--text-muted);">${d.toLocaleDateString('es-CO')} ${d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</td>
                <td style="font-size:0.82rem;">${e.productName}</td>
                <td style="font-family:monospace;font-size:0.78rem;">${e.sku}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent-rose,#A8442C);">${e.fromAisle}-${e.fromShelf}</td>
                <td style="text-align:center;font-weight:700;color:var(--accent-emerald,#5E7D52);">${e.toAisle}-${e.toShelf}</td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${e.by}</td>
            </tr>`;
        }).join('');

    section.innerHTML = `
        <div class="card">
            <div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:1rem;margin-bottom:1rem;">
                <h2 class="card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="20" height="20">
                        <path d="M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/>
                        <path d="M3 9h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
                    </svg>
                    Reubicación Manual de Inventario
                </h2>
                <input type="text" class="form-input" placeholder="Buscar producto o SKU..."
                    style="max-width:240px;padding:.4rem .8rem;font-size:0.85rem;"
                    value="${_wmsSearch}"
                    oninput="_wmsSearch=this.value;renderManualRelocation()">
            </div>
            <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">
                Haz clic en <strong>✎ Mover</strong> en cualquier producto para editar su ubicación en bodega. Los cambios se guardan en el inventario y actualizan el mapa de bodega.
            </p>
            <div class="table-responsive">
                <table class="custom-table" style="font-size:0.85rem;">
                    <thead>
                        <tr>
                            <th>SKU</th><th>Producto</th><th>Bodega</th>
                            <th style="text-align:center;">Pasillo</th>
                            <th style="text-align:center;">Estante</th>
                            <th style="text-align:center;">Nivel</th>
                            <th style="text-align:center;">Distancia</th>
                            <th style="text-align:right;">Acción</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>

        <!-- WMS Movement Log -->
        <div class="card" style="margin-top:1.5rem;">
            <div class="card-header" style="border-bottom:1px solid var(--border-subtle);padding-bottom:.75rem;margin-bottom:.75rem;">
                <h2 class="card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Historial de Movimientos WMS
                </h2>
                <span class="badge badge-info">${(state.wmsLog || []).length} movimientos</span>
            </div>
            <div class="table-responsive">
                <table class="custom-table" style="font-size:0.82rem;">
                    <thead><tr>
                        <th>Fecha/Hora</th><th>Producto</th><th>SKU</th>
                        <th style="text-align:center;">Desde</th>
                        <th style="text-align:center;">Hacia</th>
                        <th>Por</th>
                    </tr></thead>
                    <tbody>${logRows}</tbody>
                </table>
            </div>
        </div>
    `;

    // Wire the aisle selector to update distance preview live
    const aisleEl = document.getElementById('wms-e-aisle');
    if (aisleEl) {
        aisleEl.addEventListener('change', () => {
            const preview = document.getElementById('wms-e-dist-preview');
            if (preview) preview.textContent = (AISLE_DIST[aisleEl.value] || 20) + ' m';
        });
    }
}

function saveManualRelocation(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const newWarehouse = document.getElementById('wms-e-wh')?.value || product.warehouse;
    const newAisle = document.getElementById('wms-e-aisle')?.value || product.aisle;
    const newShelf = parseInt(document.getElementById('wms-e-shelf')?.value) || product.shelf;
    const newLevel = parseInt(document.getElementById('wms-e-level')?.value) || product.level;

    const prevAisle = product.aisle;
    const prevShelf = product.shelf;

    product.warehouse = newWarehouse;
    product.aisle = newAisle;
    product.shelf = newShelf;
    product.level = newLevel;
    product.pickingDistance = AISLE_DIST[newAisle] || product.pickingDistance;
    product.location = `${newAisle}-${newShelf}`;

    if (!state.wmsLog) state.wmsLog = [];
    state.wmsLog.unshift({
        ts: Date.now(),
        productId: product.id,
        productName: product.name,
        sku: product.sku || '',
        fromAisle: prevAisle,
        toAisle: newAisle,
        fromShelf: prevShelf,
        toShelf: newShelf,
        by: 'Manual'
    });
    if (state.wmsLog.length > 200) state.wmsLog.length = 200;
    localStorage.setItem('aura_wms_log', JSON.stringify(state.wmsLog));

    saveProductsToStorage();
    _wmsEditId = null;
    triggerToast('success', `${escapeHtml(product.name.split(' ').slice(0, 3).join(' '))} → ${escapeHtml(newWarehouse)}, Pasillo ${escapeHtml(newAisle)}, Est. ${newShelf}`);
    renderABCView();
}

/**
 * Renders the full ABC analytics data table.
 */
function renderABCTable(classification) {
    const tbody = document.getElementById('abc-table-body');
    tbody.innerHTML = '';

    if (classification.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
                    No se encontraron datos de rotación.
                </td>
            </tr>
        `;
        return;
    }

    classification.forEach(p => {
        const tr = document.createElement('tr');

        // Class badge color
        const classBadgeMap = {
            'A': 'badge-success',
            'B': 'badge-info',
            'C': 'badge-danger'
        };

        // Relocation status
        let relocateCell = '';
        if (p.isMisplaced) {
            relocateCell = `<span class="badge badge-danger" style="cursor: help;" title="${p.misplacedReason}">⚠️ Ajustar &rarr; Pasillo ${p.suggestedAisle}</span>`;
        } else {
            relocateCell = `<span class="badge badge-success">✅ OK</span>`;
        }

        tr.innerHTML = `
            <td>
                <div class="product-cell">
                    <div class="product-meta-info">
                        <span class="product-name">${escapeHtml(p.name)}</span>
                        <span class="product-sku">${p.sku} &bull; <strong style="color:var(--text-muted);">${p.brand}</strong></span>
                    </div>
                </div>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
                ${p.salesQuantity}
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary);">
                ${formatCurrency(p.salesRevenue)}
            </td>
            <td style="text-align: center;">
                <span style="font-family: 'JetBrains Mono'; font-size: 0.8rem; font-weight:600;">Pasillo ${p.aisle} &bull; E${p.shelf}</span>
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">
                ${p.pickingDistance}m
            </td>
            <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-gold);">
                ${p.abcScore.toFixed(1)}
            </td>
            <td>
                <span class="badge ${classBadgeMap[p.abcClass]}">Clase ${p.abcClass}</span>
            </td>
            <td style="text-align: right;">
                ${relocateCell}
            </td>
        `;

        tbody.appendChild(tr);
    });
}

function buildXLSTable(title, headers, rows) {
    const ths = headers.map(h => `<th>${h}</th>`).join('');
    const trs = rows.map(r => '<tr>' + r.map(c => `<td>${c ?? ''}</td>`).join('') + '</tr>').join('');
    return `<html xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8">
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  h2 { color: #1a1a2e; margin-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #1a1a2e; color: #ffffff; font-weight: bold; padding: 6px 10px; border: 1px solid #999; }
  td { padding: 5px 10px; border: 1px solid #ccc; }
  tr:nth-child(even) td { background: #f5f5f5; }
</style>
</head>
<body>
<h2>${title}</h2>
<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
</body></html>`;
}

function exportToCSV() {
    const classification = calculateABCClassification();

    if (classification.length === 0) {
        triggerToast('error', 'No hay datos de rotación para exportar.');
        return;
    }

    const headers = ['Producto', 'SKU', 'Categoría', 'Ventas (uds)', 'Ingresos', 'Bodega', 'Pasillo', 'Estante', 'Distancia Picking (m)', 'Score ABC', 'Clase', 'Requiere Traslado', 'Acción Recomendada'];

    const rows = classification.map(p => [
        p.name,
        p.sku,
        p.category,
        p.salesQuantity,
        p.salesRevenue.toFixed(2),
        p.warehouse,
        p.aisle,
        p.shelf,
        p.pickingDistance,
        p.abcScore.toFixed(2),
        p.abcClass,
        p.isMisplaced ? 'Sí' : 'No',
        p.isMisplaced ? `Trasladar a Pasillo ${p.suggestedAisle}` : 'Sin cambios'
    ]);

    const dateStr = new Date().toISOString().split('T')[0];
    const html = buildXLSTable(`Clasificaci\u00F3n ABC \u2014 AUREO (${dateStr})`, headers, rows);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `AUREO_Clasificacion_ABC_${dateStr}.xls`;
    link.click();

    triggerToast('success', `Planilla ABC exportada correctamente (${classification.length} productos).`);
}

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
