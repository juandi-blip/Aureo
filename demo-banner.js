// AUREO — banner persistente de "modo demo" con cuenta regresiva. Solo se
// activa si demo-gate.js (que corre antes, en <head>) autorizó la sesión.
// Al llegar a 0, limpia el estado y redirige de vuelta a la landing —
// reusa window.__auraDemoRedirect expuesto por demo-gate.js para no
// duplicar esa lógica.

(function () {
    "use strict";

    function start() {
        if (!window.AURA_DEMO_MODE || typeof window.AURA_DEMO_EXP !== "number") return;

        var bar = document.createElement("div");
        bar.id = "aura-demo-banner";
        bar.setAttribute("role", "status");
        bar.style.cssText =
            "position:fixed;top:0;left:0;right:0;z-index:9999;" +
            "background:#1B2230;color:#F4EFE6;font:600 13px/1.4 system-ui,sans-serif;" +
            "text-align:center;padding:6px 12px;letter-spacing:.02em;";
        document.body.prepend(bar);
        document.body.style.paddingTop = (bar.offsetHeight || 30) + "px";

        function render() {
            var remaining = window.AURA_DEMO_EXP - Date.now();
            if (remaining <= 0) {
                if (window.__auraDemoRedirect) window.__auraDemoRedirect("expired");
                return;
            }
            var totalSec = Math.floor(remaining / 1000);
            var mm = Math.floor(totalSec / 60);
            var ss = totalSec % 60;
            bar.textContent =
                "MODO DEMO · datos de ejemplo, se reinician al expirar · " +
                mm + ":" + (ss < 10 ? "0" : "") + ss;
        }

        render();
        setInterval(render, 1000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
