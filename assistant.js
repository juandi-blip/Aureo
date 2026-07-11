// AUREO — ASISTENTE IA: panel de chat flotante que resume el estado ya
// calculado del sistema (alertas, stock bajo, estadísticas de clientes,
// KPIs del dashboard) y lo manda como contexto a un backend serverless
// (api/assistant-chat.js) que reenvía la consulta a Claude (Anthropic).
//
// Estado actual: no hay ANTHROPIC_API_KEY configurada en Vercel todavía
// (a propósito — no hay clientes pagos aún, no queremos gastar en la API
// real). El backend responde { error: "not_configured" } y este widget lo
// muestra como un mensaje amigable en vez de un error crudo o quedarse
// colgado. Bajo `python -m http.server` (sin Vercel dev) el fetch a
// /api/assistant-chat directamente falla (404 / red) — se maneja igual,
// mismo mensaje.
//
// MOCK MODE (sólo para desarrollo local): activa un generador de respuestas
// canned/rule-based para verificar visualmente el flujo de chat sin pegarle
// a ningún backend real. Shippeado en `false` — el camino real es el default.
const AI_MOCK_MODE = false;

const ASSISTANT_ENDPOINT = "/api/assistant-chat";
const ASSISTANT_NOT_CONFIGURED_MESSAGE =
    "Asistente IA aún no está activado — contacta al administrador.";
const ASSISTANT_HISTORY_LIMIT = 8;

let assistantMessages = []; // { role: 'user' | 'assistant', text: string }
let assistantOpen = false;
let assistantBusy = false;

// --------------------------------------------------------------------------
//   INICIALIZACIÓN — widget visible para cualquier rol autenticado (admin,
//   cajero, depósito): todos pueden necesitar consultar stock, clientes o
//   facturas rápido. auth.js ya redirige a login.html a quien no tenga
//   sesión antes de que este script corra, así que no hace falta un chequeo
//   de rol adicional acá.
// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", initAssistantWidget);

function initAssistantWidget() {
    if (document.getElementById("assistant-launcher")) return; // ya inicializado
    injectAssistantStyles();

    const launcher = document.createElement("button");
    launcher.id = "assistant-launcher";
    launcher.type = "button";
    launcher.className = "assistant-launcher";
    launcher.setAttribute("aria-label", "Abrir asistente IA");
    launcher.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    launcher.addEventListener("click", toggleAssistantPanel);

    const panel = document.createElement("div");
    panel.id = "assistant-panel";
    panel.className = "assistant-panel";
    panel.innerHTML = `
        <div class="assistant-panel-header">
            <span class="assistant-panel-title">Asistente IA</span>
            <button type="button" class="assistant-close-btn" aria-label="Cerrar asistente">&times;</button>
        </div>
        <div class="assistant-messages" id="assistant-messages"></div>
        <form class="assistant-input-row" id="assistant-form" autocomplete="off">
            <input type="text" id="assistant-input" placeholder="Preguntá sobre stock, clientes o facturas..." maxlength="500" autocomplete="off" />
            <button type="submit" class="assistant-send-btn" aria-label="Enviar mensaje">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    panel.querySelector(".assistant-close-btn").addEventListener("click", toggleAssistantPanel);
    panel.querySelector("#assistant-form").addEventListener("submit", handleAssistantSubmit);

    renderAssistantMessages();
}

function toggleAssistantPanel() {
    assistantOpen = !assistantOpen;
    const panel = document.getElementById("assistant-panel");
    const launcher = document.getElementById("assistant-launcher");
    if (panel) panel.classList.toggle("open", assistantOpen);
    if (launcher) launcher.classList.toggle("active", assistantOpen);
    if (assistantOpen) {
        const input = document.getElementById("assistant-input");
        if (input) setTimeout(() => input.focus(), 60);
    }
}

// --------------------------------------------------------------------------
//   RENDER — escapeHtml() en todo lo que viene del usuario o del modelo,
//   igual que el resto de la app (core.js). Nunca inyectar texto crudo.
// --------------------------------------------------------------------------
function renderAssistantMessages() {
    const el = document.getElementById("assistant-messages");
    if (!el) return;

    if (assistantMessages.length === 0) {
        el.innerHTML =
            '<div class="assistant-empty">Preguntame sobre stock bajo, clientes inactivos, facturas pendientes o los KPIs del dashboard.</div>';
        return;
    }

    const bubbles = assistantMessages
        .map((m) => {
            const safeText = escapeHtml(m.text).replace(/\n/g, "<br>");
            const cls = m.role === "assistant" ? "assistant-msg-bot" : "assistant-msg-user";
            return `<div class="assistant-msg ${cls}">${safeText}</div>`;
        })
        .join("");

    const typingIndicator = assistantBusy
        ? '<div class="assistant-msg assistant-msg-bot assistant-typing">Pensando...</div>'
        : "";

    el.innerHTML = bubbles + typingIndicator;
    el.scrollTop = el.scrollHeight;
}

function handleAssistantSubmit(evt) {
    evt.preventDefault();
    const input = document.getElementById("assistant-input");
    if (!input) return;
    const text = input.value.trim();
    if (!text || assistantBusy) return;
    input.value = "";
    sendAssistantMessage(text);
}

async function sendAssistantMessage(text) {
    assistantMessages.push({ role: "user", text });
    assistantBusy = true;
    renderAssistantMessages();

    let replyText;
    try {
        replyText = AI_MOCK_MODE ? await mockAssistantReply(text) : await callAssistantBackend(text);
    } catch (err) {
        // Cualquier excepción no prevista (nunca debería llegar acá, ambos
        // caminos ya capturan sus propios errores) — igual la contenemos
        // para no dejar una excepción sin manejar en la consola.
        replyText = ASSISTANT_NOT_CONFIGURED_MESSAGE;
    }

    assistantMessages.push({ role: "assistant", text: replyText });
    assistantBusy = false;
    renderAssistantMessages();
}

// --------------------------------------------------------------------------
//   BACKEND REAL — /api/assistant-chat (Vercel serverless function). Bajo
//   `python -m http.server` local (sin Vercel dev) esta ruta no existe: el
//   fetch falla o devuelve un 404 HTML, no JSON. Se trata igual que
//   "not_configured" — ambos casos son "el asistente no está disponible
//   ahora mismo", y el usuario ve el mismo mensaje amigable en los dos.
// --------------------------------------------------------------------------
async function callAssistantBackend(question) {
    const context = buildAssistantContext();
    const history = assistantMessages.slice(-ASSISTANT_HISTORY_LIMIT).map((m) => ({
        role: m.role,
        text: m.text,
    }));

    let res;
    try {
        res = await fetch(ASSISTANT_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question, context, history }),
        });
    } catch (networkErr) {
        // Sin servidor Vercel/serverless corriendo (ej. servido con
        // `python -m http.server`), o sin conexión: esperado hoy.
        return ASSISTANT_NOT_CONFIGURED_MESSAGE;
    }

    let data = null;
    try {
        data = await res.json();
    } catch {
        // 404 de un server estático plano devuelve HTML, no JSON — cae acá.
        data = null;
    }

    if (!res.ok || !data || data.error) {
        return ASSISTANT_NOT_CONFIGURED_MESSAGE;
    }

    return typeof data.reply === "string" && data.reply.trim() ? data.reply : ASSISTANT_NOT_CONFIGURED_MESSAGE;
}

// --------------------------------------------------------------------------
//   CONTEXTO — resumen compacto (unas pocas líneas, no todo `state`) armado
//   a partir de funciones ya existentes de otros módulos. Esto es lo que
//   controla el costo real por consulta (~1500 tokens de entrada estimados):
//   no serializar objetos completos acá.
// --------------------------------------------------------------------------
function buildAssistantContext() {
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
async function mockAssistantReply(question) {
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
        return "[MOCK] Ésta es una respuesta simulada sobre facturación/KPIs. Con una API key real, el asistente respondería usando los datos actuales del dashboard.";
    }

    return `[MOCK] Recibí tu pregunta: "${question}". Ésta es una respuesta de prueba (modo mock) para verificar que el chat funciona visualmente, sin llamar a ninguna API real.`;
}

// --------------------------------------------------------------------------
//   ESTILOS — inyectados en JS para mantener el widget autocontenido en un
//   solo archivo nuevo. Ubicado abajo a la izquierda a propósito: el
//   toast-container ya ocupa la esquina inferior derecha (bottom: 2.5rem;
//   right: 2.5rem en styles.css) y no queremos que ambos se superpongan.
// --------------------------------------------------------------------------
function injectAssistantStyles() {
    if (document.getElementById("assistant-styles")) return;
    const style = document.createElement("style");
    style.id = "assistant-styles";
    style.textContent = `
        .assistant-launcher {
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
        .assistant-launcher:hover { transform: scale(1.06); }
        .assistant-launcher svg { width: 26px; height: 26px; }
        .assistant-launcher.active { background: var(--accent-rose-gradient, var(--accent-rose)); }

        .assistant-panel {
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
        .assistant-panel.open {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
        }
        .assistant-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.9rem 1rem;
            background: var(--accent-gold-gradient, var(--accent-gold));
            color: #fff;
            font-weight: 600;
            flex-shrink: 0;
        }
        .assistant-close-btn {
            background: none;
            border: none;
            color: #fff;
            font-size: 1.3rem;
            line-height: 1;
            cursor: pointer;
            padding: 0 0.25rem;
        }
        .assistant-messages {
            flex: 1;
            overflow-y: auto;
            padding: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
        }
        .assistant-empty {
            color: var(--text-muted, #9C907E);
            font-size: 0.85rem;
            text-align: center;
            padding: 1.5rem 0.5rem;
        }
        .assistant-msg {
            max-width: 85%;
            padding: 0.55rem 0.8rem;
            border-radius: 10px;
            font-size: 0.85rem;
            line-height: 1.4;
            word-wrap: break-word;
        }
        .assistant-msg-user {
            align-self: flex-end;
            background: var(--accent-gold, #2E4A6E);
            color: #fff;
        }
        .assistant-msg-bot {
            align-self: flex-start;
            background: var(--bg-base, #F7F3EA);
            color: var(--text-primary, #241F1A);
            border: 1px solid var(--border-subtle, #E7DCC8);
        }
        .assistant-typing { font-style: italic; color: var(--text-muted, #9C907E); }
        .assistant-input-row {
            display: flex;
            gap: 0.5rem;
            padding: 0.75rem;
            border-top: 1px solid var(--border-subtle, #E7DCC8);
            flex-shrink: 0;
        }
        .assistant-input-row input {
            flex: 1;
            padding: 0.5rem 0.7rem;
            border: 1px solid var(--border-subtle, #E7DCC8);
            border-radius: 8px;
            font-size: 0.85rem;
            background: var(--bg-base, #F7F3EA);
            color: var(--text-primary, #241F1A);
        }
        .assistant-send-btn {
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
        .assistant-send-btn svg { width: 18px; height: 18px; }

        @media (max-width: 640px) {
            .assistant-panel { left: 1rem; bottom: 5.75rem; width: calc(100vw - 2rem); }
            .assistant-launcher { left: 1rem; bottom: 1.5rem; }
        }
    `;
    document.head.appendChild(style);
}
