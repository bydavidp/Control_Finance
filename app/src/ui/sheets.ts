import { store, notify } from "../store/store";
import { categoriesFor } from "../domain/categories";
import { esc, todayISO } from "../domain/format";
import { $, setText } from "./dom";
import type { Transaction } from "../domain/types";
import { dateLabel, money } from "../domain/format";
import { categoryColor } from "../domain/categories";

type SheetId = "add" | "detail" | "welcome";
const SHEETS: Record<SheetId, string> = {
  add: "sheet-add",
  detail: "sheet-detail",
  welcome: "sheet-welcome",
};

export function openSheet(name: SheetId): void {
  store.ui.sheet = name;
  notify();
}

export function closeSheets(): void {
  store.ui.sheet = null;
  notify();
}

export function renderSheets(): void {
  const current = store.ui.sheet;
  for (const [name, id] of Object.entries(SHEETS)) {
    const el = document.getElementById(id);
    if (el) el.hidden = name !== current;
  }
  const backdrop = document.getElementById("backdrop");
  if (backdrop) backdrop.hidden = current === null;
  document.body.classList.toggle("sheet-open", current !== null);
}

export function renderDraft(): void {
  const { draft } = store.ui;
  setText("#add-title", draft.type === "income" ? "Nuevo ingreso" : "Nuevo gasto");
  document.querySelectorAll<HTMLElement>("#type-seg button").forEach((b) => {
    const on = b.dataset.type === draft.type;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  const cats = document.getElementById("cats");
  if (cats) {
    cats.innerHTML = categoriesFor(draft.type).map((c) => `
      <button class="cat${c.name === draft.category ? " active" : ""}" data-cat="${esc(c.name)}" style="--c:${c.color}">
        <span class="cat-dot"></span>${esc(c.name)}
      </button>`).join("");
  }
}

export function resetAddForm(): void {
  $<HTMLInputElement>("#f-amount").value = "";
  $<HTMLInputElement>("#f-note").value = "";
  $<HTMLInputElement>("#f-date").value = todayISO();
}

export function readAddForm(): { amount: number; note: string; date: string } {
  return {
    amount: Math.round(Number($<HTMLInputElement>("#f-amount").value)),
    note: $<HTMLInputElement>("#f-note").value.trim().slice(0, 40),
    date: $<HTMLInputElement>("#f-date").value || todayISO(),
  };
}

export function fillDetail(tx: Transaction): void {
  const icon = document.getElementById("d-icon");
  if (icon) {
    icon.textContent = tx.category.charAt(0).toUpperCase();
    icon.style.setProperty("--c", categoryColor(tx.type, tx.category));
  }
  setText("#d-amount", `${tx.type === "income" ? "+" : "−"}${money(tx.amount)}`);
  document.getElementById("d-amount")?.classList.toggle("income", tx.type === "income");
  setText("#d-meta", tx.note);
  setText("#d-cat", tx.category);
  setText("#d-date", `${dateLabel(tx.date)} · ${tx.date}`);
  setText("#d-type", tx.type === "income" ? "Ingreso" : "Gasto");
}
