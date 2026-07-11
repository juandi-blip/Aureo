// AUREO — CORE: estado global, persistencia (localStorage + API), utilidades compartidas, ruteo de tabs

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
    clients: [],
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
    labels: [],
    // Compras: solicitudes/órdenes de compra
    purchaseOrders: [],
    purchaseRequestItems: [],
    productSuppliers: [],
    // Permisos granulares: roles configurables (definidos/sembrados en auth.js)
    roles: []
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
    const [apiProducts, apiInvoices, apiSettings, apiPicking, apiClients] = await Promise.all([
        apiGet('/api/products'),
        apiGet('/api/invoices'),
        apiGet('/api/settings'),
        apiGet('/api/picking'),
        apiGet('/api/clients')
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

    // --- Clientes (CRM ligero) ---
    if (apiClients !== null) {
        state.clients = apiClients;
        localStorage.setItem("aura_clients", JSON.stringify(apiClients));
    } else {
        const storedClients = localStorage.getItem("aura_clients");
        state.clients = storedClients ? JSON.parse(storedClients) : [];
    }
    // Si no hay clientes registrados aún, derivarlos una sola vez desde las
    // facturas existentes (agrupando por NIT o, en su defecto, por nombre).
    if (state.clients.length === 0 && typeof migrateClientsFromInvoices === 'function') {
        migrateClientsFromInvoices();
        saveClientsToStorage();
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

    // --- Compras (Órdenes de Compra + asociaciones producto↔proveedor) ---
    const poRaw = localStorage.getItem('aura_purchase_orders');
    state.purchaseOrders = poRaw ? JSON.parse(poRaw) : [];
    const psRaw = localStorage.getItem('aura_product_suppliers');
    if (psRaw) {
        state.productSuppliers = JSON.parse(psRaw);
    } else if (typeof ensureProductSupplierSeed === 'function') {
        // Se auto-siembra una sola vez a partir de product.supplier ↔ supplier.name
        ensureProductSupplierSeed();
    }

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

    // --- Permisos granulares (roles) ---
    // getStoredRoles() (auth.js) ya se auto-siembra la primera vez desde el
    // mapa fijo ROLE_TABS; acá solo reflejamos ese storage en state.roles para
    // que el panel de Permisos (permissions.js) lo pueda leer/editar.
    if (typeof getStoredRoles === 'function') {
        state.roles = getStoredRoles();
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

function saveClientsToStorage() {
    localStorage.setItem("aura_clients", JSON.stringify(state.clients));
    apiPut('/api/clients', state.clients);
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
            "aura_seed_version", "aura_wms_log", "aura_clients",
            "vf_de_materials", "vf_de_suppliers", "vf_de_locations",
            "vf_de_movements", "vf_de_transit", "vf_de_labels",
            "aureo_inv_tareas", "aureo_inv_conteos", "aureo_inv_reconteos",
            "aura_purchase_orders", "aura_product_suppliers",
            "aura_roles", "aura_user_role_overrides"
        ].forEach(k => localStorage.removeItem(k));

        // Resetear estado en memoria para que loadDatabase re-siembre limpio
        state.products = [];
        state.invoices = [];
        state.clients = [];
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
        state.purchaseOrders = [];
        state.purchaseRequestItems = [];
        state.productSuppliers = [];
        state.roles = [];

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
            if (typeof populateClientDatalist === 'function') populateClientDatalist();
            updateInvoicePreview();
            break;
        case 'clientes':
            headerTitle.innerText = "Clientes";
            headerDesc.innerText = "Perfil de clientes, historial de compras y notas comerciales.";
            renderClientes();
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
        case 'reports':
            headerTitle.innerText = "Reportes";
            headerDesc.innerText = "Ventas, rotación, rentabilidad y desempeño por cliente — en una sola vista exportable.";
            renderReportes();
            break;
        case 'purchasing':
            headerTitle.innerText = "Compras";
            headerDesc.innerText = "Solicitud de pedido por punto de reorden y generación de órdenes de compra por proveedor.";
            renderPurchasing();
            break;
        case 'settings':
            headerTitle.innerText = "Parámetros Técnicos";
            headerDesc.innerText = "Configuraciones tributarias, moneda de operación y restablecimiento.";
            if (typeof renderPermisos === 'function') renderPermisos();
            break;
    }
}


// --- TOAST NOTIFICATIONS DRIVER (shared UI utility, relocated here from data-entry section) ---
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

