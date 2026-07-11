// ==========================================================================
//   VULCAN FORGE — MÓDULO DE AUTENTICACIÓN
//   Llama al backend (http://localhost:3001) si está disponible;
//   si no, usa los usuarios hardcodeados como fallback de demo.
// ==========================================================================

const AUTH_API = window.location.protocol === 'file:'
    ? 'http://localhost:3001'
    : '';

// --- Usuarios DEMO hardcodeados ---
const VULCAN_USERS = [
    { username: "admin", password: "admin123", role: "admin", name: "Administrador Master" },
    { username: "warehouse", password: "warehouse123", role: "warehouse", name: "Jefe de Depósito" },
    { username: "cashier", password: "cashier123", role: "cashier", name: "Operador de Caja" }
];

// --- Mapa de permisos: qué pestañas puede ver cada rol ---
const ROLE_TABS = {
    admin: ["dashboard", "inventory", "invoicing", "clientes", "logistics", "picking", "dataentry", "inventario", "reports", "purchasing", "settings"],
    // Warehouse ve Compras: es quien detecta el stock bajo en el día a día y
    // arma/ajusta la solicitud de pedido antes de que se genere la orden de
    // compra — el mismo criterio que ya le da acceso a Logística/WMS e
    // Inventario aunque la decisión final de compra sea administrativa.
    warehouse: ["dashboard", "inventory", "logistics", "picking", "inventario", "purchasing"],
    // Reportes: cashier ve Ventas y Por Cliente (datos de su propia operación de
    // caja); se le da acceso al módulo completo por simplicidad de v1 (no hay
    // aún un recorte de sub-pestañas por rol), igual que Warehouse ya ve todo
    // Logística aunque parte de esos datos no le apliquen operativamente.
    // Warehouse NO ve Reportes: Rotación ya la tiene disponible en Logística/WMS
    // y Ventas/Rentabilidad/Por Cliente no son de su resorte operativo.
    // Cashier NO ve Compras: es un flujo de reabastecimiento/depósito, ajeno
    // a la operación de caja (igual que no ve Logística/WMS ni Picking).
    cashier: ["dashboard", "invoicing", "clientes", "reports"]
};

const ROLE_LABELS = {
    admin: "Acceso Total · Administrador",
    warehouse: "Depósito y Logística WMS",
    cashier: "Terminal Punto de Venta"
};

// --- Configuración de sesión ---
const SESSION_KEY = "vulcan_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// ==========================================================================
//   PERMISOS GRANULARES — roles configurables (módulo "Permisos")
//   Los 3 roles fijos de arriba (ROLE_TABS) siguen siendo la fuente de verdad
//   de la primera carga: se "siembran" una única vez en localStorage como
//   registros editables. Desde ese momento, getAllowedTabs() lee SIEMPRE de
//   este storage (no de la constante ROLE_TABS), para que un admin pueda
//   crear roles nuevos o reconfigurar los 3 existentes y que tenga efecto real.
// ==========================================================================
const ROLES_KEY = "aura_roles";
const USER_ROLE_OVERRIDES_KEY = "aura_user_role_overrides";

function getStoredRoles() {
    try {
        const raw = localStorage.getItem(ROLES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {
        // storage corrupto: re-sembrar abajo
    }
    // Primera carga (o storage vacío/corrupto): sembrar desde ROLE_TABS.
    // builtIn:true marca los 3 roles que no se pueden eliminar.
    const seeded = Object.keys(ROLE_TABS).map(roleId => ({
        id: roleId,
        name: ROLE_LABELS[roleId] || roleId,
        tabs: [...ROLE_TABS[roleId]],
        builtIn: true
    }));
    localStorage.setItem(ROLES_KEY, JSON.stringify(seeded));
    return seeded;
}

function saveStoredRoles(roles) {
    localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
}

// --- Asignación opcional usuario→rol (solo para los 3 usuarios demo) ---
function getUserRoleOverrides() {
    try {
        const raw = localStorage.getItem(USER_ROLE_OVERRIDES_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        return {};
    }
}

function saveUserRoleOverrides(overrides) {
    localStorage.setItem(USER_ROLE_OVERRIDES_KEY, JSON.stringify(overrides || {}));
}

// ==========================================================================
//   HELPERS DE SESIÓN
// ==========================================================================
function setVulcanSession(user, token = null) {
    const now = Date.now();
    const session = {
        username: user.username,
        role: user.role,
        name: user.name,
        loginAt: now,
        expiresAt: now + SESSION_TTL_MS,
        token: token
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
}

function getVulcanSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session || !session.expiresAt) return null;
        if (Date.now() > session.expiresAt) {
            // Sesión expirada
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return session;
    } catch (e) {
        return null;
    }
}

function clearVulcanSession() {
    localStorage.removeItem(SESSION_KEY);
}

function getAllowedTabs(role) {
    const roles = getStoredRoles();
    const def = roles.find(r => r.id === role);
    if (def && Array.isArray(def.tabs)) return def.tabs;
    // Fallback de seguridad si el rol no existe en el storage configurable
    // (p.ej. storage manipulado a mano): usar el mapa fijo original o Dashboard.
    return ROLE_TABS[role] || ["dashboard"];
}

// Logout global (usado por el botón en el sidebar)
function vulcanLogout() {
    clearVulcanSession();
    window.location.replace("login.html");
}

// ==========================================================================
//   GUARDIA DE ACCESO (se ejecuta de inmediato al cargar el script)
// ==========================================================================
const VULCAN_IS_LOGIN_PAGE = !!document.getElementById("login-form");

// La demo ahora es responsive (drawer off-canvas + layout adaptativo): funciona
// en celular y tablet, no solo escritorio. Ya no redirigimos a desktop-only.html;
// se conserva ese archivo por si se quiere un gate opcional en el futuro.

(function guardImmediate() {
    // Página de login (selector de perfil): si ya hay sesión, entrar al sistema.
    if (VULCAN_IS_LOGIN_PAGE) {
        if (getVulcanSession()) {
            window.location.replace("index.html");
        }
        return;
    }

    // 3. Sistema principal en escritorio: entrada sin fricción (Opción B).
    //    Si no hay sesión, entramos directo como admin (el prospecto ve todo el
    //    producto de una). El selector de perfil sigue disponible: "Cerrar sesión"
    //    lleva de vuelta a login.html para ver otros roles.
    if (!getVulcanSession()) {
        const adminUser = (typeof VULCAN_USERS !== "undefined")
            ? VULCAN_USERS.find(u => u.username === "admin")
            : null;
        if (adminUser) {
            setVulcanSession(adminUser, null);
        } else {
            window.location.replace("login.html");
        }
    }
})();

// ==========================================================================
//   INICIALIZACIÓN SEGÚN CONTEXTO (login vs sistema)
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    if (VULCAN_IS_LOGIN_PAGE) {
        initLoginForm();
    } else {
        initAppSession();
    }
});

// --------------------------------------------------------------------------
//   LÓGICA DEL FORMULARIO DE LOGIN
// --------------------------------------------------------------------------
function initLoginForm() {
    const form = document.getElementById("login-form");
    const userInput = document.getElementById("login-username");
    const passInput = document.getElementById("login-password");
    const toggleBtn = document.getElementById("toggle-password");
    const errorBox = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit");

    // Mostrar / ocultar contraseña
    toggleBtn.addEventListener("click", () => {
        const isHidden = passInput.type === "password";
        passInput.type = isHidden ? "text" : "password";
        toggleBtn.classList.toggle("revealed", isHidden);
        toggleBtn.setAttribute("aria-label", isHidden ? "Ocultar contraseña" : "Mostrar contraseña");
    });

    // Limpiar error al escribir
    [userInput, passInput].forEach(inp => {
        inp.addEventListener("input", () => {
            hideLoginError(errorBox);
            inp.closest(".login-field").classList.remove("field-error");
        });
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = userInput.value.trim();
        const password = passInput.value;

        // Validaciones visuales
        let valid = true;
        if (!username) {
            userInput.closest(".login-field").classList.add("field-error");
            valid = false;
        }
        if (!password) {
            passInput.closest(".login-field").classList.add("field-error");
            valid = false;
        }
        if (!valid) {
            showLoginError(errorBox, "Completa usuario y contraseña para continuar.");
            return;
        }

        setLoading(submitBtn, true);
        hideLoginError(errorBox);

        let authOk = false;

        // Intentar login contra el backend (max 2s); si falla o no hay backend, usar usuarios locales
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${AUTH_API}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                setVulcanSession(data.user, data.token);
                authOk = true;
            }
        } catch {
            // Backend no disponible o timeout — continuar con autenticación local
        }

        // Fallback: usuarios hardcodeados (siempre disponible para demo)
        if (!authOk) {
            const user = VULCAN_USERS.find(u => u.username === username && u.password === password);
            if (user) {
                // La contraseña/usuario se validan exactamente igual que antes;
                // lo único configurable es a qué ROL queda asignado ese usuario
                // (ver Permisos → "Asignar rol a usuario"), por defecto su rol original.
                const overrides = getUserRoleOverrides();
                const effectiveRole = overrides[user.username] || user.role;
                setVulcanSession({ ...user, role: effectiveRole }, null);
                authOk = true;
            }
        }

        if (authOk) {
            submitBtn.classList.add("btn-success-state");
            submitBtn.querySelector(".btn-label").innerText = "Acceso concedido";
            setTimeout(() => window.location.replace("index.html"), 550);
        } else {
            setLoading(submitBtn, false);
            showLoginError(errorBox, "Credenciales inválidas. Verifica tu usuario y contraseña.");
            form.classList.remove("shake");
            void form.offsetWidth;
            form.classList.add("shake");
            passInput.value = "";
            passInput.focus();
        }
    });
}

function setLoading(btn, isLoading) {
    btn.classList.toggle("loading", isLoading);
    btn.disabled = isLoading;
}

function showLoginError(box, message) {
    box.querySelector(".error-text").innerText = message;
    box.classList.add("visible");
}

function hideLoginError(box) {
    box.classList.remove("visible");
}

// --------------------------------------------------------------------------
//   APLICAR SESIÓN Y PERMISOS EN EL SISTEMA PRINCIPAL
// --------------------------------------------------------------------------
function initAppSession() {
    const session = getVulcanSession();
    if (!session) {
        window.location.replace("login.html");
        return;
    }

    const allowed = getAllowedTabs(session.role);

    // 1. Mostrar datos del usuario en el sidebar
    const nameEl = document.getElementById("session-username");
    const roleEl = document.getElementById("session-userrole");
    if (nameEl) nameEl.innerText = session.name;
    if (roleEl) {
        const roleDef = getStoredRoles().find(r => r.id === session.role);
        roleEl.innerText = (roleDef && roleDef.name) || ROLE_LABELS[session.role] || session.role;
    }

    // 2. Ocultar módulos (pestañas) no permitidos para el rol
    const allTabs = ["dashboard", "inventory", "invoicing", "clientes", "logistics", "picking", "dataentry", "inventario", "reports", "purchasing", "settings"];
    allTabs.forEach(tab => {
        const link = document.getElementById(`nav-${tab}`);
        if (!link) return;
        const li = link.closest(".nav-item");
        if (li) li.style.display = allowed.includes(tab) ? "" : "none";
    });

    // 3. Blindar switchTab: impedir navegación a módulos sin permiso
    if (typeof window.switchTab === "function") {
        const originalSwitch = window.switchTab;
        window.switchTab = function (tabId) {
            if (!allowed.includes(tabId)) {
                if (typeof triggerToast === "function") {
                    triggerToast("error", "No tienes permisos para acceder a este módulo.");
                }
                return;
            }
            return originalSwitch(tabId);
        };
    }

    // 4. Si la pestaña activa por defecto no está permitida, ir a la primera válida
    if (!allowed.includes("dashboard")) {
        const firstAllowed = allowed[0];
        if (firstAllowed && typeof window.switchTab === "function") {
            window.switchTab(firstAllowed);
        }
    }
}
