// AUREO — Vercel serverless function: valida el token firmado que la landing
// emite tras capturar el email del visitante (gate de la demo pública).
//
// Mismo algoritmo que aureo-landing/lib/demo-token.ts: HMAC-SHA256 sobre
// `${sessionId}.${exp}` con el secreto compartido DEMO_TOKEN_SECRET (env var
// idéntica en ambos proyectos Vercel). El token NO lleva el email del
// visitante — solo un sessionId aleatorio opaco — para no exponer PII en una
// URL (historial del navegador, Referer, analytics). Sin dependencias npm —
// mismo criterio que api/melyor-chat.js: ninguno de los dos proyectos tiene
// hoy un flujo de build.

const crypto = require("crypto");

module.exports = async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).json({ ok: false });
        return;
    }

    const secret = process.env.DEMO_TOKEN_SECRET;
    if (!secret) {
        res.status(500).json({ ok: false });
        return;
    }

    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
        res.status(400).json({ ok: false });
        return;
    }

    let decoded;
    try {
        decoded = Buffer.from(token, "base64url").toString("utf8");
    } catch (e) {
        res.status(401).json({ ok: false });
        return;
    }

    const parts = decoded.split(".");
    if (parts.length !== 3) {
        res.status(401).json({ ok: false });
        return;
    }
    const [sessionId, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!sessionId || !Number.isFinite(exp)) {
        res.status(401).json({ ok: false });
        return;
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${sessionId}.${exp}`)
        .digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    const validSig = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!validSig || Date.now() > exp) {
        res.status(401).json({ ok: false });
        return;
    }

    res.status(200).json({ ok: true, exp });
};
