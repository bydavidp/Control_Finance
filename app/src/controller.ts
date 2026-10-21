import { store, commit, notify, addTransaction, removeTransaction, setSettings, defaultDraft, replaceState, enqueue, resetLocal, buildDemo } from "./store/store";
import { normalizeState } from "./store/storage";
import { currentMonth, shiftMonth, todayISO } from "./domain/format";
import { enqueueCloud, syncNow } from "./cloud/sync";
import { cloud } from "./cloud/status";
import { createQuickToken, copyText, shortcutConfig } from "./cloud/token";
import { signOut } from "./auth/session";
import { setPin, removePin, hasPin } from "./auth/pin";
import { openSheet, closeSheets, resetAddForm, readAddForm, fillDetail } from "./ui/sheets";
import { setMsg, $ } from "./ui/dom";
import { toast } from "./ui/toast";
import type { TabId, TxType, Filter } from "./domain/types";

const isStatic = new URLSearchParams(location.search).get("static") === "1";

export function showTab(tab: TabId): void {
  store.ui.tab = tab;
  document.getElementById("main")?.scrollTo({ top: 0 });
  notify();
}

export function openAdd(type: TxType): void {
  defaultDraft(type);
  resetAddForm();
  openSheet("add");
  if (!isStatic) setTimeout(() => $<HTMLInputElement>("#f-amount").focus(), 240);
}

export function setDraftType(type: TxType): void {
  defaultDraft(type);
  notify();
}

export function setDraftCategory(name: string): void {
  store.ui.draft.category = name;
  notify();
}

export function saveTransaction(): void {
  const { amount, note, date } = readAddForm();
  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Escribe un monto mayor a 0");
    $<HTMLInputElement>("#f-amount").focus();
    return;
  }
  const { type, category } = store.ui.draft;
  const tx = addTransaction({ type, amount, category, note: note || category, date });
  enqueueCloud({ op: "upsert", tx });
  commit();
  closeSheets();
  showTab("home");
  toast("Movimiento guardado");
}

export function openDetail(id: string): void {
  const tx = store.state.transactions.find((t) => t.id === id);
  if (!tx) return;
  store.ui.detailId = id;
  fillDetail(tx);
  openSheet("detail");
}

export function deleteTransaction(): void {
  const id = store.ui.detailId;
  const tx = store.state.transactions.find((t) => t.id === id);
  if (!tx) return;
  if (!confirm(`¿Eliminar "${tx.note}"? Esta acción no se puede deshacer.`)) return;
  removeTransaction(tx.id);
  enqueueCloud({ op: "delete", id: tx.id });
  store.ui.detailId = null;
  commit();
  closeSheets();
  toast("Movimiento eliminado");
}

export function saveSettings(): void {
  const name = $<HTMLInputElement>("#input-name").value.trim().slice(0, 24) || "David";
  const goal = Math.max(0, Math.round(Number($<HTMLInputElement>("#input-goal").value) || 0));
  setSettings(name, goal);
  enqueueCloud({ op: "settings", settings: { ...store.state.settings } });
  commit();
  toast("Ajustes guardados");
}

export function setFilter(filter: Filter): void {
  store.ui.filter = filter;
  notify();
}

export function shiftMonthBy(delta: number): void {
  store.ui.month = shiftMonth(store.ui.month, delta);
  notify();
}

export function exportData(): void {
  const payload = {
    app: "Control Finance",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: { ...store.state, pending: [] },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `control-finance-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Copia de seguridad generada");
}

export function importFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = normalizeState(JSON.parse(String(reader.result)));
      if (!parsed) throw new Error("Formato no válido");
      if (!confirm(`Se reemplazarán tus datos actuales por ${parsed.transactions.length} movimientos. ¿Continuar?`)) return;
      replaceState({ ...parsed, onboarded: true, pending: [] });
      if (cloud.uid) {
        enqueue({ op: "replace", transactions: store.state.transactions.map((t) => ({ ...t })) });
        void syncNow(true);
      }
      commit();
      store.ui.month = currentMonth();
      showTab("home");
      toast("Datos importados");
    } catch (error) {
      console.error(error);
      toast("El archivo no tiene un formato válido");
    }
  };
  reader.readAsText(file);
}

export async function resetAll(): Promise<void> {
  if (!confirm("¿Borrar TODOS tus movimientos y ajustes? Esta acción no se puede deshacer.")) return;
  const logged = Boolean(cloud.uid);
  resetLocal();
  if (logged) {
    cloud.hasQuickToken = false;
    cloud.quickToken = "";
    if (cloud.uid) localStorage.removeItem("cf.quickToken." + cloud.uid);
    enqueue({ op: "reset" });
    commit();
    await syncNow(true);
    store.state.onboarded = true;
  }
  commit();
  if (!logged) openSheet("welcome");
  toast("Datos borrados");
}

export function seedDemo(showToast = true): void {
  store.state.transactions = buildDemo();
  store.state.onboarded = true;
  commit();
  if (showToast) toast("Datos de ejemplo cargados");
}

export function welcomeStart(): void {
  closeSheets();
  setTimeout(() => openAdd("expense"), 180);
}

export function welcomeBlank(): void {
  store.state.onboarded = true;
  commit();
  closeSheets();
}

export async function generateToken(): Promise<void> {
  if (cloud.hasQuickToken && !confirm("Esto invalida el token anterior. El Atajo dejará de funcionar hasta que lo actualices. ¿Continuar?")) return;
  const result = await createQuickToken();
  setMsg("#quick-msg", result.message, result.ok ? "ok" : "error");
  notify();
}

export async function copyToken(): Promise<void> {
  if (!cloud.quickToken) return toast("Genera un token primero");
  toast((await copyText(cloud.quickToken)) ? "Token copiado" : "No se pudo copiar");
}

export async function copyShortcut(): Promise<void> {
  const token = cloud.quickToken || "GENERA_UN_TOKEN";
  toast((await copyText(shortcutConfig(token, todayISO()))) ? "Configuración copiada (contiene tu token)" : "No se pudo copiar");
}

export async function logout(): Promise<void> {
  if (!confirm("¿Cerrar sesión? Tus datos seguirán en la nube y en este dispositivo.")) return;
  await signOut();
  toast("Sesión cerrada");
}

export async function savePinFromForm(): Promise<void> {
  const uid = cloud.uid;
  if (!uid) return;
  const pin = $<HTMLInputElement>("#pin-new").value.trim();
  const repeat = $<HTMLInputElement>("#pin-confirm").value.trim();
  if (!/^\d{4}$/.test(pin)) return setMsg("#pin-msg", "El PIN debe tener 4 números.", "error");
  if (pin !== repeat) return setMsg("#pin-msg", "Los PIN no coinciden.", "error");
  if (!crypto.subtle) return setMsg("#pin-msg", "Este navegador no permite usar PIN.", "error");
  await setPin(uid, pin);
  $<HTMLInputElement>("#pin-new").value = "";
  $<HTMLInputElement>("#pin-confirm").value = "";
  setMsg("#pin-msg", "PIN guardado. Te lo pediremos al abrir la app en este dispositivo.", "ok");
  notify();
}

export function removePinFromDevice(): void {
  const uid = cloud.uid;
  if (!uid || !hasPin(uid)) return;
  if (!confirm("¿Quitar el PIN de este dispositivo? Seguirás con sesión iniciada.")) return;
  removePin(uid);
  setMsg("#pin-msg", "");
  toast("PIN quitado");
  notify();
}

