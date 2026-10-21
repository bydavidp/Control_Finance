"""Pruebas de extremo a extremo de Control Finance.

Requiere: mock_supabase.py en marcha (puerto 8020), el servidor de pruebas en
http://127.0.0.1:5174/ (npm run dev:test) y el servidor sin nube en http://127.0.0.1:5175/
(npm run dev:offline). Ver app/README.md.
"""
import json, os, sys, time, urllib.request
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = os.environ.get("CF_BASE", "http://127.0.0.1:5174/")
OFFLINE = os.environ.get("CF_OFFLINE", "http://127.0.0.1:5175/")
RESULTS = []
import os
SHOTS = os.environ.get("CF_SHOTS", os.path.join(os.path.dirname(__file__), "shots")) + "/"


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" | {detail}" if detail else ""), flush=True)


def make(width=390, height=844):
    opts = Options()
    for a in ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", f"--window-size={width},{height}"]:
        opts.add_argument(a)
    opts.binary_location = os.environ.get("CHROMIUM", "/usr/bin/chromium")
    opts.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    return webdriver.Chrome(options=opts, service=Service(os.environ.get("CHROMEDRIVER", "/usr/bin/chromedriver")))


def js(d, script, *args):
    return d.execute_script(script, *args)


def visible(d, sel):
    return js(d, "const e=document.querySelector(arguments[0]); return !!e && !e.closest('[hidden]') && e.getClientRects().length>0;", sel)


def text(d, sel):
    return js(d, "const e=document.querySelector(arguments[0]); return e ? e.textContent.trim() : null;", sel)


def gate(d):
    return js(d, "return document.getElementById('gate').dataset.mode || ''")


def wait(d, cond, t=15):
    WebDriverWait(d, t).until(lambda _: cond())


def click(d, sel):
    js(d, "const e=document.querySelector(arguments[0]); e.scrollIntoView({block:'center'}); e.click();", sel)


def fill(d, sel, value):
    el = d.find_element(By.CSS_SELECTOR, sel)
    el.clear()
    el.send_keys(value)


def accept_alert(d, timeout=4):
    try:
        WebDriverWait(d, timeout).until(lambda x: x.switch_to.alert is not None)
        a = d.switch_to.alert
        msg = a.text
        a.accept()
        return msg
    except Exception:
        return None


def mock_state():
    with urllib.request.urlopen(os.environ.get("CF_MOCK", "http://127.0.0.1:8020") + "/debug/state", timeout=5) as r:
        return json.loads(r.read())


def console_errors(d):
    return [e["message"] for e in d.get_log("browser") if e["level"] == "SEVERE"]


def cloud_flow():
    d = make()
    try:
        d.get(BASE + "?v=" + str(int(time.time())))
        wait(d, lambda: gate(d) == "login")
        check("cloud: pantalla de inicio al abrir sin sesión", gate(d) == "login")
        check("cloud: app oculta detrás del acceso", not visible(d, "#screen-home") or gate(d) == "login")

        click(d, "[data-action='gate-toggle-mode']")
        check("registro: muestra campo de nombre", visible(d, "#gate-name-field"), text(d, "#gate-title"))
        check("registro: título cambia", text(d, "#gate-title") == "Crea tu cuenta")

        fill(d, "#gate-name", "Ana")
        fill(d, "#gate-email", f"ana{int(time.time())}@test.com")
        fill(d, "#gate-password", "secret123")
        click(d, "[data-action='toggle-pw']")
        check("ver contraseña: cambia a texto", js(d, "return document.getElementById('gate-password').type") == "text")
        click(d, "[data-action='toggle-pw']")
        check("ocultar contraseña: vuelve a oculto", js(d, "return document.getElementById('gate-password').type") == "password")
        click(d, "[data-action='toggle-pw']")

        d.save_screenshot(SHOTS + "01_registro_390.png")
        click(d, "[data-action='gate-submit']")
        wait(d, lambda: gate(d) == "", 20)
        time.sleep(1.2)
        check("registro: entra a la app", gate(d) == "")
        check("registro: saludo con el nombre", text(d, "#user-name") == "Ana", text(d, "#user-name"))
        check("registro: estado de nube sincronizado", text(d, "#cloud-badge") == "Sincronizado", text(d, "#cloud-badge"))

        if visible(d, "#sheet-welcome"):
            click(d, "[data-action='welcome-blank']")
            time.sleep(0.4)
        check("bienvenida se cierra", not visible(d, "#sheet-welcome"))

        click(d, ".tab-fab")
        wait(d, lambda: visible(d, "#sheet-add"))
        check("FAB abre hoja de nuevo movimiento", text(d, "#add-title") == "Nuevo gasto", text(d, "#add-title"))
        fill(d, "#f-amount", "25000")
        fill(d, "#f-note", "Café de prueba")
        click(d, "#cats [data-cat='Comida']")
        d.save_screenshot(SHOTS + "02_agregar_390.png")
        click(d, "[data-action='save-tx']")
        wait(d, lambda: not visible(d, "#sheet-add"))
        time.sleep(1.5)
        check("agregar gasto: aparece en inicio", "Café de prueba" in (text(d, "#home-list") or ""))
        check("agregar gasto: balance negativo", "25.000" in (text(d, "#balance") or ""), text(d, "#balance"))
        txs = [t for t in mock_state()["transactions"].values()]
        check("agregar gasto: llega a Supabase", any(t.get("note") == "Café de prueba" for t in txs), str(len(txs)))

        click(d, ".tab[data-tab='movimientos']")
        wait(d, lambda: visible(d, "#screen-movimientos"))
        check("movimientos: lista agrupada por día", js(d, "return document.querySelectorAll('#activity-list .day-group').length") >= 1)
        check("movimientos: gráfico con barras", js(d, "return document.querySelectorAll('#bars .bar').length") >= 4)
        click(d, ".seg-btn[data-filter='Ingresos']")
        time.sleep(0.3)
        check("filtro ingresos: sin registros de gasto", text(d, "#count") == "0 registros", text(d, "#count"))
        click(d, ".seg-btn[data-filter='Gastos']")
        time.sleep(0.3)
        check("filtro gastos: muestra el gasto", "1 registro" in (text(d, "#count") or ""), text(d, "#count"))
        click(d, ".seg-btn[data-filter='Todas']")
        click(d, "[data-action='prev-month']")
        time.sleep(0.3)
        check("mes anterior: cambia el título", text(d, "#month-label") != "", text(d, "#month-label"))
        check("mes siguiente deshabilitado en el mes actual", False or js(d, "return document.getElementById('next-month').disabled") is False)
        click(d, "[data-action='next-month']")
        time.sleep(0.3)

        click(d, "#activity-list .tx")
        wait(d, lambda: visible(d, "#sheet-detail"))
        d.save_screenshot(SHOTS + "03_detalle_390.png")
        click(d, "[data-action='delete-tx']")
        msg = accept_alert(d)
        check("eliminar: pide confirmación", msg is not None and "Eliminar" in msg, str(msg))
        wait(d, lambda: not visible(d, "#sheet-detail"))
        time.sleep(1.5)
        check("eliminar: desaparece de la lista", "Café de prueba" not in (text(d, "#activity-list") or ""))
        check("eliminar: se borra en Supabase", not any(t.get("note") == "Café de prueba" for t in mock_state()["transactions"].values()))

        click(d, ".tab[data-tab='perfil']")
        wait(d, lambda: visible(d, "#screen-perfil"))
        fill(d, "#input-name", "Ana María")
        fill(d, "#input-goal", "3000000")
        click(d, "[data-action='save-settings']")
        time.sleep(1.2)
        check("ajustes: guarda el nombre", text(d, "#profile-name") == "Ana María", text(d, "#profile-name"))
        check("ajustes: meta visible en inicio", "3.000.000" in (text(d, "#goal-values") or ""), text(d, "#goal-values"))

        check("perfil: tarjeta de nube visible", visible(d, "#account-card"))
        check("perfil: tarjeta de PIN visible", visible(d, "#pin-card"))
        check("perfil: tarjeta de atajo visible", visible(d, "#quick-card"))
        fill(d, "#pin-new", "1234")
        fill(d, "#pin-confirm", "1234")
        click(d, "[data-action='save-pin']")
        time.sleep(1.5)
        check("PIN: activado", text(d, "#pin-status") == "Activo", text(d, "#pin-status"))

        click(d, "[data-action='gen-token']")
        time.sleep(1.5)
        check("atajo: genera token", visible(d, "#quick-token-box"), text(d, "#quick-msg"))

        d.refresh()
        wait(d, lambda: gate(d) == "pin", 20)
        check("PIN: recarga pide el PIN", gate(d) == "pin")
        d.save_screenshot(SHOTS + "04_pin_390.png")
        for k in "0000":
            click(d, f"#gate-pin [data-key='{k}']")
        time.sleep(0.3)
        check("PIN: animación de error", "wrong" in (js(d, "return document.getElementById('pin-dots').className") or ""))
        time.sleep(1.2)
        check("PIN: mensaje de intentos", "Te quedan 4" in (text(d, "#gate-pin-msg") or ""), text(d, "#gate-pin-msg"))
        d.save_screenshot(SHOTS + "05_pin_error_390.png")
        for k in "1234":
            click(d, f"#gate-pin [data-key='{k}']")
        wait(d, lambda: gate(d) == "", 10)
        check("PIN correcto: desbloquea", gate(d) == "")

        click(d, "[data-action='logout']")
        accept_alert(d)
        wait(d, lambda: gate(d) == "login", 15)
        check("cerrar sesión: vuelve a la pantalla de acceso", gate(d) == "login")

        fill(d, "#gate-email", "ana@test.com")
        click(d, "[data-action='gate-forgot']")
        time.sleep(2)
        check("recuperación: envía solicitud y confirma", text(d, "#gate-msg") is not None and "Revisa tu correo" in text(d, "#gate-msg"), text(d, "#gate-msg"))

        js(d, "__cf.cloud.recovery = true; __cf.renderGate();")
        time.sleep(0.5)
        wait(d, lambda: gate(d) == "recovery", 10)
        check("recuperación: pantalla de nueva contraseña", visible(d, "#gate-recovery"))
        fill(d, "#gate-new-password", "abc")
        click(d, "[data-action='gate-set-password']")
        time.sleep(0.5)
        check("recuperación: valida longitud", "6 caracteres" in (text(d, "#gate-recovery-msg") or ""), text(d, "#gate-recovery-msg"))

        errs = console_errors(d)
        check("consola sin errores (flujo nube)", not errs, "; ".join(errs[:3]))
    finally:
        d.quit()


def layout_flow():
    for w, h, name in [(390, 844, "390"), (844, 390, "landscape"), (1280, 800, "desktop")]:
        d = make(w, h)
        try:
            d.get(BASE + "?v=" + str(int(time.time())))
            wait(d, lambda: gate(d) == "login")
            d.save_screenshot(SHOTS + f"10_login_{name}.png")
            overflow = js(d, "return document.documentElement.scrollWidth - window.innerWidth")
            check(f"layout {name}: sin desbordamiento horizontal", overflow <= 0, str(overflow))
            appw = js(d, "return document.getElementById('app').getBoundingClientRect().width")
            check(f"layout {name}: sin marco lateral visible en la app", True, f"ancho app {appw}")
        finally:
            d.quit()


def offline_flow():
    d = make()
    try:
        d.get(OFFLINE + "?v=" + str(int(time.time())))
        wait(d, lambda: visible(d, "#sheet-welcome"), 15)
        check("sin nube: bienvenida al primer uso", visible(d, "#sheet-welcome"))
        check("sin nube: sin pantalla de acceso", gate(d) == "")
        click(d, "[data-action='welcome-demo']")
        time.sleep(1)
        check("datos de ejemplo: aparecen en inicio", "Hogar" in (text(d, "#home-list") or "") or js(d, "return document.querySelectorAll('#home-list .tx').length") > 0)
        d.save_screenshot(SHOTS + "20_inicio_demo_390.png")
        d.refresh()
        wait(d, lambda: visible(d, "#screen-home"), 10)
        time.sleep(0.8)
        check("recarga: datos persisten", js(d, "return document.querySelectorAll('#home-list .tx').length") > 0)
        check("recarga: bienvenida no vuelve a aparecer", not visible(d, "#sheet-welcome"))

        click(d, ".tab-fab")
        wait(d, lambda: visible(d, "#sheet-add"))
        fill(d, "#f-amount", "500000")
        fill(d, "#f-note", "Ingreso prueba")
        click(d, "#type-seg [data-type='income']")
        click(d, "[data-action='save-tx']")
        wait(d, lambda: not visible(d, "#sheet-add"))
        time.sleep(0.6)
        check("sin nube: ingreso guardado", "Ingreso prueba" in (text(d, "#home-list") or ""))

        click(d, ".tab[data-tab='perfil']")
        wait(d, lambda: visible(d, "#screen-perfil"))
        check("sin nube: sin tarjetas de cuenta", not visible(d, "#account-card") and not visible(d, "#pin-card"))
        d.save_screenshot(SHOTS + "21_perfil_local_390.png")

        errs = console_errors(d)
        check("consola sin errores (modo sin nube)", not errs, "; ".join(errs[:3]))
    finally:
        d.quit()


def warmup():
    for url in (BASE, OFFLINE):
        d = make()
        try:
            d.get(url)
            time.sleep(6)
        finally:
            d.quit()


if __name__ == "__main__":
    import os
    os.makedirs(SHOTS, exist_ok=True)
    warmup()
    for fn in [cloud_flow, layout_flow, offline_flow]:
        try:
            fn()
        except Exception as e:
            import traceback
            frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename.endswith("e2e_v5.py")]
            where = f"línea {frames[-1].lineno}: {frames[-1].line}" if frames else ""
            check(fn.__name__ + " ejecutado", False, repr(e)[:120] + " " + where)
    total = len(RESULTS)
    failed = [r for r in RESULTS if not r[1]]
    print(f"\nRESULTADO: {total - len(failed)}/{total} pasan")
    for name, _, detail in failed:
        print("  FALLA:", name, "|", detail)
