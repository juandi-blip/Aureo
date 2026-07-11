// AUREO — MELYOR: panel de chat flotante que resume el estado ya
// calculado del sistema (alertas, stock bajo, estadísticas de clientes,
// KPIs del dashboard) y lo manda como contexto a un backend serverless
// (api/melyor-chat.js) que reenvía la consulta a Claude (Anthropic).
//
// Estado actual: no hay ANTHROPIC_API_KEY configurada en Vercel todavía
// (a propósito — no hay clientes pagos aún, no queremos gastar en la API
// real). El backend responde { error: "not_configured" } y este widget lo
// muestra como un mensaje amigable en vez de un error crudo o quedarse
// colgado. Bajo `python -m http.server` (sin Vercel dev) el fetch a
// /api/melyor-chat directamente falla (404 / red) — se maneja igual,
// mismo mensaje.
//
// MOCK MODE (sólo para desarrollo local): activa un generador de respuestas
// canned/rule-based para verificar visualmente el flujo de chat sin pegarle
// a ningún backend real. Shippeado en `false` — el camino real es el default.
const AI_MOCK_MODE = false;

const MELYOR_ENDPOINT = "/api/melyor-chat";
const MELYOR_NOT_CONFIGURED_MESSAGE =
    "Melyor aún no está activado — contacta al administrador.";
const MELYOR_HISTORY_LIMIT = 8;

let melyorMessages = []; // { role: 'user' | 'assistant', text: string }
let melyorOpen = false;
let melyorBusy = false;

// --------------------------------------------------------------------------
//   INICIALIZACIÓN — widget visible para cualquier rol autenticado (admin,
//   cajero, depósito): todos pueden necesitar consultar stock, clientes o
//   facturas rápido. auth.js ya redirige a login.html a quien no tenga
//   sesión antes de que este script corra, así que no hace falta un chequeo
//   de rol adicional acá.
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", initMelyorWidget);

function initMelyorWidget() {
    if (document.getElementById("melyor-launcher")) return; // ya inicializado
    injectMelyorStyles();

    const launcher = document.createElement("button");
    launcher.id = "melyor-launcher";
    launcher.type = "button";
    launcher.className = "melyor-launcher";
    launcher.setAttribute("aria-label", "Abrir Melyor");
    launcher.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L20 7 L20 17 L12 22 L4 17 L4 7 Z"/><path d="M7.5 15.5 L7.5 8.5 L12 13 L16.5 8.5 L16.5 15.5"/></svg>';
    launcher.addEventListener("click", toggleMelyorPanel);

    const panel = document.createElement("div");
    panel.id = "melyor-panel";
    panel.className = "melyor-panel";
    panel.innerHTML = `
        <div class="melyor-panel-header">
            <span class="melyor-panel-title">Melyor</span>
            <button type="button" class="melyor-close-btn" aria-label="Cerrar Melyor">&times;</button>
        </div>
        <div class="melyor-messages" id="melyor-messages"></div>
        <form class="melyor-input-row" id="melyor-form" autocomplete="off">
            <input type="text" id="melyor-input" placeholder="Preguntá sobre stock, clientes o facturas..." maxlength="500" autocomplete="off" />
            <button type="submit" class="melyor-send-btn" aria-label="Enviar mensaje">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    panel.querySelector(".melyor-close-btn").addEventListener("click", toggleMelyorPanel);
    panel.querySelector("#melyor-form").addEventListener("submit", handleMelyorSubmit);

    renderMelyorMessages();
}

function toggleMelyorPanel() {
    melyorOpen = !melyorOpen;
    const panel = document.getElementById("melyor-panel");
    const launcher = document.getElementById("melyor-launcher");
    if (panel) panel.classList.toggle("open", melyorOpen);
    if (launcher) launcher.classList.toggle("active", melyorOpen);
    if (melyorOpen) {
        const input = document.getElementById("melyor-input");
        if (input) setTimeout(() => input.focus(), 60);
    }
}

// --------------------------------------------------------------------------
//   RENDER — escapeHtml() en todo lo que viene del usuario o del modelo,
//   igual que el resto de la app (core.js). Nunca inyectar texto crudo.
// --------------------------------------------------------------------------
function renderMelyorMessages() {
    const el = document.getElementById("melyor-messages");
    if (!el) return;

    if (melyorMessages.length === 0) {
        el.innerHTML =
            '<div class="melyor-empty">Preguntame sobre stock bajo, clientes inactivos, facturas pendientes o los KPIs del dashboard.</div>';
        return;
    }

    const bubbles = melyorMessages
        .map((m) => {
            const safeText = escapeHtml(m.text).replace(/\n/g, "<br>");
            const cls = m.role === "assistant" ? "melyor-msg-bot" : "melyor-msg-user";
            return `<div class="melyor-msg ${cls}">${safeText}</div>`;
        })
        .join("");

    const typingIndicator = melyorBusy
        ? '<div class="melyor-msg melyor-msg-bot melyor-typing">Pensando...</div>'
        : "";

    el.innerHTML = bubbles + typingIndicator;
    el.scrollTop = el.scrollHeight;
}

function handleMelyorSubmit(evt) {
    evt.preventDefault();
    const input = document.getElementById("melyor-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text || melyorBusy) return;
    input.value = "";
    sendMelyorMessage(text);
}

async function sendMelyorMessage(text) {
    melyorMessages.push({ role: "user", text });
    melyorBusy = true;
    renderMelyorMessages();

    let replyText;
    try {
        replyText = AI_MOCK_MODE ? await mockMelyorReply(text) : await callMelyorBackend(text);
    } catch (err) {
        // Cualquier excepción no prevista (nunca debería llegar acá, ambos
        // caminos ya capturan sus propios errores) — igual la contenemos
        // para no dejar una excepción sin manejar en la consola.
        replyText = MELYOR_NOT_CONFIGURED_MESSAGE;
    }

    melyorMessages.push({ role: "assistant", text: replyText });
    melyorBusy = false;
    renderMelyorMessages();
}

// --------------------------------------------------------------------------
//   BACKEND REAL — /api/melyor-chat (Vercel serverless function). Bajo
//   `python -m http.server` local (sin Vercel dev) esta ruta no existe: el
//   fetch falla o devuelve un 404 HTML, no JSON. Se trata igual que
//   "not_configured" — ambos casos son "Melyor no está disponible ahora
//   mismo", y el usuario ve el mismo mensaje amigable en los dos.
// --------------------------------------------------------------------------
async function callMelyorBackend(question) {
    const context = buildMelyorContext();
    const history = melyorMessages.slice(-MELYOR_HISTORY_LIMIT).map((m) => ({
        role: m.role,
        text: m.text,
    }));

    let res;
    try {
        res = await fetch(MELYOR_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, context, history }),
        });
    } catch (networkErr) {
        // Sin servidor Vercel/serverless corriendo (ej. servido con
        // `python -m http.server`), o sin conexión: esperado hoy.
        return MELYOR_NOT_CONFIGURED_MESSAGE;
    }

    let data = null;
    try {
        data = await res.json();
    } catch {
        // 404 de un server estático plano devuelve HTML, no JSON — cae acá.
        data = null;
    }

    if (!res.ok || !data || data.error) {
        return MELYOR_NOT_CONFIGURED_MESSAGE;
    }

    return typeof data.reply === "string" && data.reply.trim() ? data.reply : MELYOR_NOT_CONFIGURED_MESSAGE;
}

// --------------------------------------------------------------------------
//   CONTEXTO — resumen compacto (unas pocas líneas, no todo `state`) armado
//   a partir de funciones ya existentes de otros módulos. Esto es lo que
//   controla el costo real por consulta (~1500 tokens de entrada estimados):
//   no serializar objetos completos acá.
// --------------------------------------------------------------------------
function buildMelyorContext() {
    const lines = [];

    try {
        const paidTotal = (state.invoices || [])
            .filter((inv) => inv.status === "paid")
            .reduce((sum, inv) => sum + (inv.total || 0), 0);
        const totalInvoices = (state.invoices || []).length;
        const totalStock = (state.products || []).reduce((sum, p) => sum + Number(p.stock || 0), 0);
        lines.push(
            `KPIs dashboard: facturación pagada ${formatCurrency(paidTotal)}, ${totalInvoices} facturas totales, ${totalStock} unidades de stock en total.`
        );
    } catch (e) {
        /* KPIs no disponibles: seguimos sin ellos, no rompemos el contexto */
    }

    try {
        const lowStock = typeof getLowStockProducts === "function" ? getLowStockProducts() : [];
        if (lowStock.length) {
            const sample = lowStock
                .slice(0, 8)
                .map((p) => `${p.sku || p.name} (stock ${p.stock}, mínimo ${p.threshold})`)
                .join("; ");
            lines.push(`Productos bajo punto de reorden (${lowStock.length}): ${sample}${lowStock.length > 8 ? "…" : ""}.`);
        } else {
            lines.push("No hay productos bajo el punto de reorden ahora mismo.");
        }
    } catch (e) {
        /* alerts.js no cargó o falló: seguimos sin este dato */
    }

    try {
        const alerts = typeof computeAlerts === "function" ? computeAlerts() : [];
        if (alerts.length) {
            const sample = alerts.slice(0, 6).map((a) => a.message).join(" | ");
            lines.push(`Alertas proactivas activas (${alerts.length}): ${sample}.`);
        } else {
            lines.push("No hay alertas proactivas activas.");
        }
    } catch (e) {
        /* idem */
    }

    try {
        if (typeof computeClientStats === "function") {
            const withStats = (state.clients || []).map((c) => ({ c, stats: computeClientStats(c) }));
            const topClients = withStats
                .filter((x) => x.stats.count > 0)
                .sort((a, b) => b.stats.totalValue - a.stats.totalValue)
                .slice(0, 5);
            if (topClients.length) {
                lines.push(
                    `Top clientes por valor histórico: ${topClients
                        .map((x) => `${x.c.nombre} (${formatCurrency(x.stats.totalValue)}, ${x.stats.count} compras)`)
                        .join("; ")}.`
                );
            }
        }
    } catch (e) {
        /* clients.js no cargó o falló: seguimos sin este dato */
    }

    return lines.join("\n");
}

// --------------------------------------------------------------------------
//   MOCK MODE — sólo para verificar visualmente el flujo del chat en local
//   sin pegarle a ninguna API real ni gastar un centavo. Reglas simples,
//   mismo espíritu que el motor de alerts.js. Se activa manualmente
//   cambiando AI_MOCK_MODE a `true` arriba de este archivo — nunca en el
//   código que se despliega.
// --------------------------------------------------------------------------
async function mockMelyorReply(question) {
    await new Promise((resolve) => setTimeout(resolve, 450)); // simula latencia de red
    const q = question.toLowerCase();

    if (q.includes("stock") || q.includes("inventario") || q.includes("reorden")) {
        const lowStock = typeof getLowStockProducts === "function" ? getLowStockProducts() : [];
        return lowStock.length
            ? `[MOCK] Hay ${lowStock.length} producto(s) bajo el punto de reorden. Revisá el módulo de Inventario para el detalle.`
            : "[MOCK] No hay productos bajo el punto de reorden en este momento.";
    }

    if (q.includes("cliente")) {
        return "[MOCK] Ésta es una respuesta simulada sobre clientes. Activá una API key real de Anthropic para respuestas basadas en tus datos.";
    }

    if (q.includes("factura") || q.includes("venta") || q.includes("kpi")) {
        return "[MOCK] Ésta es una respuesta simulada sobre facturación/KPIs. Con una API key real, Melyor respondería usando los datos actuales del dashboard.";
    }

    return `[MOCK] Recibí tu pregunta: "${question}". Ésta es una respuesta de prueba (modo mock) para verificar que el chat funciona visualmente, sin llamar a ninguna API real.`;
}

// --------------------------------------------------------------------------
//   ESTILOS — inyectados en JS para mantener el widget autocontenido en un
//   solo archivo nuevo. Ubicado abajo a la izquierda a propósito: el
//   toast-container ya ocupa la esquina inferior derecha (bottom: 2.5rem;
//   right: 2.5rem en styles.css) y no queremos que ambos se superpongan.
// --------------------------------------------------------------------------
function injectMelyorStyles() {
    if (document.getElementById("melyor-styles")) return;
    const style = document.createElement("style");
    style.id = "melyor-styles";
    style.textContent = `
        .melyor-launcher {
            position: fixed;
            bottom: 2.5rem;
            left: 2.5rem;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            border: none;
            background: var(--accent-gold-gradient, var(--accent-gold));
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
            z-index: 1900;
            transition: transform 0.15s ease;
        }
        .melyor-launcher:hover { transform: scale(1.06); }
        .melyor-launcher svg { width: 26px; height: 26px; }
        .melyor-launcher.active { background: var(--accent-rose-gradient, var(--accent-rose)); }

        .melyor-panel {
            position: fixed;
            bottom: 6.5rem;
            left: 2.5rem;
            width: 340px;
            max-width: calc(100vw - 3rem);
            height: 460px;
            max-height: calc(100vh - 9rem);
            background: var(--bg-surface, #fff);
            border: 1px solid var(--border-subtle, #E7DCC8);
            border-radius: var(--radius-md, 12px);
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            opacity: 0;
            transform: translateY(12px);
            pointer-events: none;
            transition: opacity 0.15s ease, transform 0.15s ease;
            z-index: 1901;
            overflow: hidden;
        }
        .melyor-panel.open {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }
        .melyor-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.9rem 1rem;
            background: var(--accent-gold-gradient, var(--accent-gold));
            color: #fff;
            font-weight: 600;
            flex-shrink: 0;
        }
        .melyor-close-btn {
            background: none;
            border: none;
            color: #fff;
            font-size: 1.3rem;
            line-height: 1;
            cursor: pointer;
            padding: 0 0.25rem;
        }
        .melyor-messages {
            flex: 1;
            overflow-y: auto;
            padding: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
        }
        .melyor-empty {
            color: var(--text-muted, #9C907E);
            font-size: 0.85rem;
            text-align: center;
            padding: 1.5rem 0.5rem;
        }
        .melyor-msg {
            max-width: 85%;
            padding: 0.55rem 0.8rem;
            border-radius: 10px;
            font-size: 0.85rem;
            line-height: 1.4;
            word-wrap: break-word;
        }
        .melyor-msg-user {
            align-self: flex-end;
            background: var(--accent-gold, #2E4A6E);
            color: #fff;
        }
        .melyor-msg-bot {
            align-self: flex-start;
            background: var(--bg-base, #F7F3EA);
            color: var(--text-primary, #241F1A);
            border: 1px solid var(--border-subtle, #E7DCC8);
        }
        .melyor-typing { font-style: italic; color: var(--text-muted, #9C907E); }
        .melyor-input-row {
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem;
            border-top: 1px solid var(--border-subtle, #E7DCC8);
            flex-shrink: 0;
        }
        .melyor-input-row input {
            flex: 1;
            padding: 0.5rem 0.7rem;
            border: 1px solid var(--border-subtle, #E7DCC8);
            border-radius: 8px;
            font-size: 0.85rem;
            background: var(--bg-base, #F7F3EA);
            color: var(--text-primary, #241F1A);
        }
        .melyor-send-btn {
            border: none;
            background: var(--accent-gold, #2E4A6E);
            color: #fff;
            border-radius: 8px;
            width: 38px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
        }
        .melyor-send-btn svg { width: 18px; height: 18px; }

        @media (max-width: 640px) {
            .melyor-panel { left: 1rem; bottom: 5.75rem; width: calc(100vw - 2rem); }
            .melyor-launcher { left: 1rem; bottom: 1.5rem; }
        }
    `;
    document.head.appendChild(style);
}
