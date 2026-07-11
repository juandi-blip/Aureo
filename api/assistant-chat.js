// AUREO — Vercel serverless function: proxy hacia la API de Anthropic (Claude).
//
// Mantiene la ANTHROPIC_API_KEY server-side (variable de entorno de Vercel) —
// nunca se expone al frontend. Si la key no está configurada (estado actual,
// a propósito: todavía no hay clientes pagos y no queremos gastar en la API
// real), responde un JSON de error claro en vez de crashear o devolver un
// 500 críptico. El frontend (assistant.js) reconoce "not_configured" y
// muestra un mensaje amigable al usuario.
//
// Modelo: claude-haiku-4-5 — el más económico ($1 / $5 por millón de
// tokens de entrada/salida), elegido a propósito porque las consultas son
// lookups simples sobre datos ya calculados (alertas, stock bajo,
// estadísticas de clientes, KPIs), no tareas de razonamiento profundo.
//
// Sin dependencias npm: usa `fetch` nativo (disponible en el runtime Node.js
// de Vercel) en vez del SDK de Anthropic, porque ninguno de los dos
// proyectos (aureo / aureo-demo) tiene hoy un flujo de build con npm — no
// tiene sentido introducir uno solo para esta función.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;

// Límites defensivos para no mandar (ni pagar) payloads gigantes si algo en
// el frontend se descontrola.
const MAX_QUESTION_CHARS = 2000;
const MAX_CONTEXT_CHARS = 6000;
const MAX_HISTORY_TURNS = 8;

const SYSTEM_PROMPT = `Sos el asistente de datos de Aureo, un sistema de gestión de inventario, ventas y logística.
Respondé siempre en español, de forma breve, concreta y en texto plano (sin markdown pesado).
Basate únicamente en el CONTEXTO ACTUAL DEL SISTEMA que se te provee en cada mensaje — es un resumen
ya calculado del estado real (alertas, stock bajo, clientes, KPIs). No inventes cifras que no estén ahí.
Si la pregunta no se puede responder con ese contexto, decilo honestamente y sugerí en qué módulo de
Aureo podría encontrar esa información el usuario (Inventario, Facturación, Clientes, Compras, Logística/WMS).`;

module.exports = async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({
            error: "method_not_allowed",
            message: "Este endpoint sólo acepta POST.",
        });
        return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.status(501).json({
            error: "not_configured",
            message:
                "El asistente IA todavía no tiene una API key de Anthropic configurada en este entorno.",
        });
        return;
    }

    let body = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            body = null;
        }
    }
    body = body && typeof body === "object" ? body : {};

    const question =
        typeof body.question === "string" ? body.question.slice(0, MAX_QUESTION_CHARS).trim() : "";
    const context =
        typeof body.context === "string" ? body.context.slice(0, MAX_CONTEXT_CHARS) : "";
    const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];

    if (!question) {
        res.status(400).json({
            error: "invalid_request",
            message: "Falta la pregunta ('question').",
        });
        return;
    }

    const messages = [];
    history.forEach((turn) => {
        if (!turn || typeof turn.text !== "string" || !turn.text.trim()) return;
        const role = turn.role === "assistant" ? "assistant" : "user";
        messages.push({ role, content: turn.text.slice(0, MAX_QUESTION_CHARS) });
    });
    messages.push({
        role: "user",
        content: `Contexto actual del sistema:\n${context || "(sin datos disponibles)"}\n\nPregunta: ${question}`,
    });

    let upstream;
    try {
        upstream = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: MAX_TOKENS,
                system: SYSTEM_PROMPT,
                messages,
            }),
        });
    } catch (networkErr) {
        res.status(502).json({
            error: "upstream_unreachable",
            message: "No se pudo contactar a la API de Anthropic.",
        });
        return;
    }

    let data = null;
    try {
        data = await upstream.json();
    } catch {
        data = null;
    }

    if (!upstream.ok) {
        res.status(502).json({
            error: "upstream_error",
            message: (data && data.error && data.error.message) || "Error al contactar a Anthropic.",
        });
        return;
    }

    const textBlock =
        data && Array.isArray(data.content) ? data.content.find((b) => b && b.type === "text") : null;
    const reply = (textBlock && textBlock.text) || "No obtuve una respuesta del modelo.";

    res.status(200).json({ reply });
};
