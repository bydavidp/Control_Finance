import { store } from "../store/store";
import { totalsOf, distinctMonths } from "../domain/calc";
import { compactMoney, signedMoney, initials } from "../domain/format";
import { cloud, STATUS_LABEL, type CloudStatus } from "../cloud/status";
import { hasPin } from "../auth/pin";
import { setText, setHidden, setInputValue } from "../ui/dom";

const STATUS_CLASS: Record<CloudStatus, string> = {
  local: "",
  connecting: "status-pill--busy",
  syncing: "status-pill--busy",
  synced: "status-pill--ok",
  offline: "status-pill--warn",
  error: "status-pill--error",
};

function badge(el: HTMLElement | null, status: CloudStatus, label: string): void {
  if (!el) return;
  el.textContent = label;
  el.className = `status-pill ${STATUS_CLASS[status]}`.trim();
}

export function renderProfile(): void {
  const { state } = store;
  const name = state.settings.name || "David";
  const totals = totalsOf(state.transactions);

  setText("#avatar-lg", initials(name));
  setText("#profile-name", name);
  setText("#profile-sub", cloud.enabled && cloud.uid ? cloud.email : "Datos guardados en este dispositivo");
  setInputValue("#input-name", name);
  setInputValue("#input-goal", state.settings.goal ? String(state.settings.goal) : "");

  setText("#stat-tx", String(state.transactions.length));
  setText("#stat-months", String(distinctMonths(state.transactions)));
  setText("#stat-saved", compactMoney(totals.balance));
  document.getElementById("stat-saved")?.setAttribute("title", signedMoney(totals.balance));

  const logged = cloud.enabled && Boolean(cloud.uid);
  const label = cloud.enabled ? STATUS_LABEL[cloud.status] : "Local";
  badge(document.getElementById("cloud-badge"), cloud.enabled ? cloud.status : "local", label);
  badge(document.getElementById("account-status"), cloud.status, label);

  setHidden("#account-card", !logged);
  setHidden("#pin-card", !logged);
  setHidden("#quick-card", !logged);
  if (!logged) return;

  setText("#account-email", cloud.email);
  const when = cloud.lastSync
    ? new Date(cloud.lastSync).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const info: Partial<Record<CloudStatus, string>> = {
    connecting: "Conectando con la nube…",
    syncing: "Sincronizando cambios…",
    offline: "Sin conexión. Se reintentará al volver.",
    error: "No se pudo sincronizar. Revisa tu conexión.",
  };
  setText("#sync-info", info[cloud.status] ?? `Última sincronización: ${when}`);

  const pinOn = hasPin(cloud.uid);
  setText("#pin-status", pinOn ? "Activo" : "Desactivado");
  const pinStatus = document.getElementById("pin-status");
  if (pinStatus) pinStatus.className = `status-pill ${pinOn ? "status-pill--ok" : ""}`.trim();
  setText("#pin-save", pinOn ? "Cambiar PIN" : "Activar PIN");
  setHidden("#pin-remove", !pinOn);

  setText("#gen-token", cloud.hasQuickToken ? "Regenerar token" : "Generar token");
  const box = document.getElementById("quick-token-box");
  const input = document.getElementById("quick-token") as HTMLInputElement | null;
  if (box && input) {
    box.hidden = !cloud.quickToken;
    input.value = cloud.quickToken;
  }
}
