import { store } from "./store/store";
import type { Filter, TabId, TxType } from "./domain/types";
import { closeSheets } from "./ui/sheets";
import {
  togglePassword,
  toggleSignupMode,
  submitLogin,
  submitSignup,
  forgotPassword,
  submitNewPassword,
  pressPinKey,
  usePasswordInstead,
} from "./ui/gate";
import { syncNow } from "./cloud/sync";
import { cloud } from "./cloud/status";
import { lockNow } from "./auth/session";
import * as c from "./controller";

function isSignupMode(): boolean {
  return cloud.signupMode && !cloud.uid;
}

function submitAccess(): void {
  if (isSignupMode()) void submitSignup();
  else void submitLogin();
}

function handleAction(el: HTMLElement): void {
  const action = el.dataset.action;
  const type = (el.dataset.type ?? "expense") as TxType;
  switch (action) {
    case "tab": return c.showTab((el.dataset.tab ?? "home") as TabId);
    case "add": return c.openAdd(type);
    case "close-sheet":
      if (store.ui.sheet === "welcome") return;
      return closeSheets();
    case "save-tx": return c.saveTransaction();
    case "delete-tx": return c.deleteTransaction();
    case "prev-month": return c.shiftMonthBy(-1);
    case "next-month": return c.shiftMonthBy(1);
    case "save-settings": return c.saveSettings();
    case "export": return c.exportData();
    case "import": return document.getElementById("import-file")?.click();
    case "reset": return void c.resetAll();
    case "welcome-start": return c.welcomeStart();
    case "welcome-demo":
      closeSheets();
      c.seedDemo(true);
      return c.showTab("home");
    case "welcome-blank": return c.welcomeBlank();
    case "gate-submit": return submitAccess();
    case "gate-toggle-mode": return toggleSignupMode();
    case "gate-forgot": return void forgotPassword();
    case "gate-set-password": return void submitNewPassword();
    case "gate-password": return usePasswordInstead();
    case "toggle-pw": return togglePassword(el);
    case "pin-key": return void pressPinKey(el.dataset.key ?? "");
    case "sync-now": return void syncNow(false);
    case "logout": return void c.logout();
    case "gen-token": return void c.generateToken();
    case "copy-token": return void c.copyToken();
    case "copy-shortcut": return void c.copyShortcut();
    case "save-pin": return void c.savePinFromForm();
    case "remove-pin": return c.removePinFromDevice();
    case "lock-now": return lockNow();
    default: return;
  }
}

export function bindEvents(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const actionEl = target.closest<HTMLElement>("[data-action]");
    if (actionEl) {
      handleAction(actionEl);
      return;
    }

    const seg = target.closest<HTMLElement>("#type-seg button");
    if (seg) {
      c.setDraftType((seg.dataset.type ?? "expense") as TxType);
      return;
    }

    const filter = target.closest<HTMLElement>(".seg-btn[data-filter]");
    if (filter) {
      c.setFilter((filter.dataset.filter ?? "Todas") as Filter);
      return;
    }

    const cat = target.closest<HTMLElement>("[data-cat]");
    if (cat) {
      c.setDraftCategory(cat.dataset.cat ?? "Otros");
      return;
    }

    const row = target.closest<HTMLElement>(".tx[data-id]");
    if (row?.dataset.id) c.openDetail(row.dataset.id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && store.ui.sheet && store.ui.sheet !== "welcome") closeSheets();
    const target = event.target;
    if (
      (event.key === "Enter" || event.key === " ") &&
      target instanceof HTMLElement &&
      target.matches("[role=button][data-action]")
    ) {
      event.preventDefault();
      handleAction(target);
    }
  });

  document.getElementById("import-file")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) c.importFile(file);
    input.value = "";
  });

  document.getElementById("gate-password")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submitAccess();
  });

  document.getElementById("gate-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAccess();
  });

  document.getElementById("gate-new-password")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void submitNewPassword();
  });

  document.getElementById("pin-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void c.savePinFromForm();
  });

  document.getElementById("recovery-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitNewPassword();
  });
}
