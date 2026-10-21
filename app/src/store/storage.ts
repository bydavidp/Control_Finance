import type { AppState, PendingOp, Transaction } from "../domain/types";
import { todayISO, uid } from "../domain/format";

export const STORAGE_KEY = "controlfinance.v1";

export function defaultState(): AppState {
  return {
    version: 1,
    onboarded: false,
    settings: { name: "David", goal: 2000000 },
    transactions: [],
    pending: [],
  };
}

function normalizeTransaction(t: unknown): Transaction | null {
  if (!t || typeof t !== "object") return null;
  const raw = t as Record<string, unknown>;
  const amount = typeof raw.amount === "number" ? Math.round(raw.amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : todayISO();
  const category = String(raw.category || "Otros").slice(0, 24);
  return {
    id: String(raw.id || uid()),
    type: raw.type === "income" ? "income" : "expense",
    amount,
    category,
    note: String(raw.note || category || "Movimiento").slice(0, 80),
    date,
    createdAt: Number(raw.createdAt) || 0,
  };
}

export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const wrapper = raw as Record<string, unknown>;
  const inner = wrapper.state && typeof wrapper.state === "object" ? (wrapper.state as Record<string, unknown>) : null;
  const data = inner && Array.isArray(inner.transactions) ? inner : wrapper;
  if (!Array.isArray(data.transactions)) return null;

  const transactions = data.transactions
    .map(normalizeTransaction)
    .filter((t): t is Transaction => t !== null);

  const pending = (Array.isArray(data.pending) ? data.pending : [])
    .filter((op): op is PendingOp => Boolean(op) && typeof (op as { op?: unknown }).op === "string")
    .slice(-200);

  const settings = (data.settings && typeof data.settings === "object" ? data.settings : {}) as Record<string, unknown>;
  return {
    version: 1,
    onboarded: Boolean(data.onboarded),
    settings: {
      name: String(settings.name || "David").slice(0, 24),
      goal: Math.max(0, Number(settings.goal) || 0),
    },
    transactions,
    pending,
  };
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn("No se pudo leer el almacenamiento:", error);
    return null;
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
