import { store, onChange } from "./store/store";
import { hydrateIcons } from "./ui/icons";
import { renderGate } from "./ui/gate";
import { renderHome } from "./views/home";
import { renderMovements } from "./views/movements";
import { renderProfile } from "./views/profile";
import { renderSheets, renderDraft } from "./ui/sheets";

export function renderTabs(): void {
  const tab = store.ui.tab;
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((el) => {
    el.classList.toggle("active", el.dataset.screen === tab);
  });
  document.querySelectorAll<HTMLElement>(".tab[data-tab]").forEach((el) => {
    const on = el.dataset.tab === tab;
    el.classList.toggle("active", on);
    if (on) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
}

export function renderAll(): void {
  hydrateIcons();
  renderGate();
  renderHome();
  renderMovements();
  renderProfile();
  renderDraft();
  renderSheets();
  renderTabs();
}

export function startRendering(): void {
  onChange(renderAll);
  renderAll();
}
