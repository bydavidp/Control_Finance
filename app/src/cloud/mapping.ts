import type { Transaction } from "../domain/types";
import { todayISO } from "../domain/format";

export interface CloudRow {
  id: string;
  user_id?: string;
  type: string;
  amount: number | string;
  category: string | null;
  note: string | null;
  date: string | null;
  created_at: string | null;
}

export function toCloud(tx: Transaction, userId: string | null): CloudRow {
  return {
    id: tx.id,
    user_id: userId ?? undefined,
    type: tx.type,
    amount: tx.amount,
    category: tx.category,
    note: tx.note,
    date: tx.date,
    created_at: new Date(tx.createdAt || Date.now()).toISOString(),
  };
}

export function fromCloud(row: CloudRow): Transaction {
  return {
    id: String(row.id),
    type: row.type === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(Number(row.amount) || 0)),
    category: String(row.category || "Otros"),
    note: String(row.note || row.category || "Movimiento"),
    date: String(row.date || todayISO()).slice(0, 10),
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
  };
}
