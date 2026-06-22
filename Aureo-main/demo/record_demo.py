"""
Graba un video del sistema AUREO tal como se ve en el navegador.
Solo navega por cada sección del menú lateral, sin overlays ni cambios en la UI.
Uso: python record_demo.py
Salida: demo/aureo-demo.webm
"""

import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_DIR = Path(__file__).resolve().parent.parent
LOGIN_URL = (BASE_DIR / "login.html").as_uri()
OUTPUT_DIR = Path(__file__).resolve().parent
FINAL_VIDEO = OUTPUT_DIR / "aureo-demo.webm"

VIEWPORT = {"width": 1440, "height": 900}

# Orden exacto del menú lateral en index.html
SECTIONS = [
    ("dataentry", 4),
    ("dashboard", 5),
    ("inventory", 5),
    ("invoicing", 5),
    ("logistics", 5),
    ("picking", 4),
    ("settings", 4),
]


def pause(page, seconds: float) -> None:
    page.wait_for_timeout(int(seconds * 1000))


def visit_section(page, tab_id: str, dwell: float) -> None:
    page.click(f"#nav-{tab_id}")
    page.wait_for_selector(f"#{tab_id}-view.active", timeout=10000)
    pause(page, dwell)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(OUTPUT_DIR),
            record_video_size=VIEWPORT,
            locale="es-CL",
        )
        page = context.new_page()

        # Login
        page.goto(LOGIN_URL, wait_until="networkidle")
        pause(page, 3)
        page.click('.demo-account[data-user="admin"]')
        pause(page, 1)
        page.click("#login-submit")
        page.wait_for_url("**/index.html", timeout=15000)
        page.wait_for_load_state("networkidle")
        pause(page, 2)

        # Cada sección del sistema, en el orden del menú
        for tab_id, dwell in SECTIONS:
            visit_section(page, tab_id, dwell)

        pause(page, 1)

        raw_video = page.video.path()
        context.close()
        browser.close()

        if raw_video and Path(raw_video).exists():
            if FINAL_VIDEO.exists():
                FINAL_VIDEO.unlink()
            shutil.move(raw_video, FINAL_VIDEO)
            print(f"Video guardado en: {FINAL_VIDEO}")
        else:
            print("Error: no se generó el archivo de video.")


if __name__ == "__main__":
    main()
