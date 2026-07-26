// AUREO — GATE de la demo pública: exige un token válido (emitido por la
// landing tras capturar el email del visitante) antes de dejar cargar la
// app, y limita cada sesión a 30 minutos.
//
// Se carga como el PRIMER <script> del <head>, antes que cualquier otro
// (incluido auth.js, que hoy auto-loguea como admin sin pedir nada). Usa
// XHR síncrona para la verificación porque este script debe decidir "dejar
// pasar o redirigir" antes de que el resto del documento se parsee —
// ninguno de los dos proyectos tiene un flujo de build (ver comentario en
// api/melyor-chat.js), así que no hay forma de reestructurar la carga de
// scripts sin introducir uno solo para esto. La llamada solo ocurre una vez
// por sesión de 30 min: los reloads dentro de la ventana usan el fast-path
// de sessionStorage de abajo, sin red.

(function () {
    "use strict";

    var SESSION_KEY = "aura_demo_session";
    var LANDING_URL = "https://aureo-landing.vercel.app"; // actualizar si se activa un dominio propio

    function clearDemoStorage() {
        try { localStorage.clear(); } catch (e) {}
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    }

    function redirectToLanding(reason) {
        clearDemoStorage();
        window.location.replace(LANDING_URL + "/?demo=" + reason);
    }
    // Expuesto para que demo-banner.js redirija con la misma lógica al expirar.
    window.__auraDemoRedirect = redirectToLanding;

    function readSession() {
        try {
            var raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            var s = JSON.parse(raw);
            if (!s || typeof s.exp !== "number") return null;
            return s;
        } catch (e) {
            return null;
        }
    }

    var session = readSession();
    if (session && session.exp > Date.now()) {
        window.AURA_DEMO_MODE = true;
        window.AURA_DEMO_EXP = session.exp;
        return;
    }

    var params = new URLSearchParams(window.location.search);
    var token = params.get("token");
    if (!token) {
        redirectToLanding("required");
        return;
    }

    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/verify-demo-token?token=" + encodeURIComponent(token), false);
    try {
        xhr.send(null);
    } catch (e) {
        redirectToLanding("required");
        return;
    }

    if (xhr.status !== 200) {
        redirectToLanding("expired");
        return;
    }

    var result = null;
    try {
        result = JSON.parse(xhr.responseText);
    } catch (e) {
        // result queda null, se maneja abajo
    }
    if (!result || result.ok !== true || typeof result.exp !== "number") {
        redirectToLanding("expired");
        return;
    }

    // Token válido: reset completo antes de que auth.js/core.js lean nada de
    // localStorage, para que cada visitante gateado arranque con datos limpios.
    clearDemoStorage();
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ exp: result.exp }));
    } catch (e) {}

    window.AURA_DEMO_MODE = true;
    window.AURA_DEMO_EXP = result.exp;

    params.delete("token");
    var clean = window.location.pathname +
        (params.toString() ? "?" + params.toString() : "") +
        window.location.hash;
    window.history.replaceState({}, "", clean);
})();
