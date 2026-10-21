import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";

import { registerSW } from "virtual:pwa-register";
import { store } from "./store/store";
import { STORAGE_KEY } from "./store/storage";
import { cloud } from "./cloud/status";
import { startRendering, renderAll } from "./render";
import { bindEvents } from "./events";
import { initAuth } from "./auth/init";
import { startLifecycle } from "./lifecycle";
import { seedDemo } from "./controller";
import { applyStaticMode } from "./ui/shell";
import { renderGate } from "./ui/gate";
import { removeOldCaches } from "./cleanup";

function boot(): void {
  applyStaticMode();
  void removeOldCaches();

  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");
  if (tab === "movimientos" || tab === "perfil") store.ui.tab = tab;
  if (params.get("demo") === "1" && !localStorage.getItem(STORAGE_KEY)) seedDemo(false);

  bindEvents();
  startRendering();

  if (!cloud.enabled && !store.state.onboarded) {
    store.ui.sheet = "welcome";
    renderAll();
  }

  initAuth();
  startLifecycle();
  registerSW({ immediate: true });
}

if (import.meta.env.MODE !== "production") {
  (window as unknown as { __cf: unknown }).__cf = { store, cloud, renderGate };
}

boot();
