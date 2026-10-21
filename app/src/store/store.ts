import type { AppState, Filter, PendingOp, TabId, Transaction, TxType } from "../domain/types";
import { currentMonth, uid, monthOf } from "../domain/format";
import { categoriesFor } from "../domain/categories";
import { STORAGE_KEY, defaultState, loadState, saveState } from "./storage";

export interface UiState {
  tab: TabId;
  month: string;
  filter: Filter;
  draft: { type: TxType; category: string };
  detailId: string | null;
  sheet: "add" | "detail" | "welcome" | null;
}

export const store: { state: AppState; ui: UiState } = {
  state: loadState() ?? defaultState(),
  ui: {
    tab: "home",
    month: currentMonth(),
    filter: "Todas",
    draft: { type: "expense", category: "Comida" },
    detailId: null,
    sheet: null,
  },
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function onChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(): void {
  listeners.forEach((fn) => fn());
}

export function persist(): boolean {
  return saveState(store.state);
}

export function commit(): void {
  persist();
  notify();
}

export function replaceState(next: AppState): void {
  store.state = next;
}

export function enqueue(op: PendingOp): void {
  store.state.pending.push(op);
  persist();
}

export function clearPending(): void {
  store.state.pending = [];
}

export function addTransaction(input: {
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string;
}): Transaction {
  const tx: Transaction = { id: uid(), ...input, createdAt: Date.now() };
  store.state.transactions.push(tx);
  store.state.onboarded = true;
  store.ui.month = monthOf(tx.date);
  store.ui.filter = "Todas";
  return tx;
}

export function removeTransaction(id: string): void {
  store.state.transactions = store.state.transactions.filter((t) => t.id !== id);
}

export function setSettings(name: string, goal: number): void {
  store.state.settings = { name, goal };
}

export function defaultDraft(type: TxType): void {
  store.ui.draft = { type, category: categoriesFor(type)[0]?.name ?? "Otros" };
}

export function resetLocal(): void {
  store.state = defaultState();
  store.state.onboarded = false;
  store.ui.month = currentMonth();
  store.ui.filter = "Todas";
  localStorage.removeItem(STORAGE_KEY);
}

export function buildDemo(now = new Date()): Transaction[] {
  const current = now.getMonth();
  const year = now.getFullYear();

  function tx(offset: number, day: number, type: TxType, amount: number, category: string, note: string): Transaction {
    const base = new Date(year, current + offset, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const cap = offset === 0 ? Math.max(1, Math.min(now.getDate(), lastDay)) : lastDay;
    const safeDay = Math.min(day, cap);
    const date = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
    return { id: uid(), type, amount, category, note, date, createdAt: Date.now() - Math.round(Math.random() * 1e6) };
  }

  return [
    tx(0, 1, "income", 4250000, "Salario", "Nómina del mes"),
    tx(0, 2, "expense", 860400, "Hogar", "Arriendo"),
    tx(0, 4, "expense", 86400, "Comida", "Mercado semanal"),
    tx(0, 6, "expense", 16900, "Ocio", "Spotify"),
    tx(0, 8, "expense", 12300, "Transporte", "Uber al trabajo"),
    tx(0, 11, "expense", 45000, "Comida", "Almuerzos"),
    tx(0, 13, "income", 320000, "Freelance", "Diseño web"),
    tx(0, 15, "expense", 120000, "Compras", "Ropa"),
    tx(0, 18, "expense", 68000, "Salud", "Farmacia"),
    tx(-1, 1, "income", 4250000, "Salario", "Nómina del mes"),
    tx(-1, 3, "expense", 860400, "Hogar", "Arriendo"),
    tx(-1, 8, "expense", 210000, "Comida", "Mercado"),
    tx(-1, 12, "expense", 60000, "Transporte", "Gasolina"),
    tx(-1, 16, "expense", 150000, "Ocio", "Salida"),
    tx(-1, 20, "expense", 80000, "Salud", "Farmacia"),
    tx(-2, 4, "expense", 95000, "Comida", "Restaurante"),
  ];
}

