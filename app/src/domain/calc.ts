import type { Transaction } from "./types";
import { isoDate, monthOf } from "./format";

export interface Totals {
  income: number;
  expense: number;
  balance: number;
}

export const byDateDesc = (a: Transaction, b: Transaction): number =>
  b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

export function monthTransactions(all: Transaction[], month: string): Transaction[] {
  return all.filter((t) => monthOf(t.date) === month).sort(byDateDesc);
}

export function totalsOf(list: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of list) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

export function lastSevenDaysExpenses(all: Transaction[], today = new Date()): number[] {
  const days: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    days.push(all
      .filter((t) => t.type === "expense" && t.date === iso)
      .reduce((sum, t) => sum + t.amount, 0));
  }
  return days;
}

export interface WeekBreakdown {
  weeks: number[];
  total: number;
  peak: number;
  expenseCount: number;
}

export function weeklyExpenses(list: Transaction[], month: string): WeekBreakdown {
  const [year = 1970, mon = 1] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const weeks: number[] = Array.from({ length: weekCount }, () => 0);
  let expenseCount = 0;
  for (const t of list) {
    if (t.type !== "expense") continue;
    expenseCount++;
    const day = Number(t.date.slice(8, 10));
    const index = Math.min(weekCount - 1, Math.floor((day - 1) / 7));
    weeks[index] = (weeks[index] ?? 0) + t.amount;
  }
  const total = weeks.reduce((a, b) => a + b, 0);
  const max = Math.max(...weeks, 0);
  const peak = max > 0 ? weeks.indexOf(max) : -1;
  return { weeks, total, peak, expenseCount };
}

export function topExpenseCategory(list: Transaction[]): { name: string; total: number; count: number } | null {
  const byCat = new Map<string, number>();
  for (const t of list) {
    if (t.type !== "expense") continue;
    byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  }
  const ranked = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const first = ranked[0];
  if (!first) return null;
  return { name: first[0], total: first[1], count: ranked.length };
}

export function goalProgress(balance: number, goal: number): { saved: number; pct: number } {
  const saved = Math.max(0, balance);
  const pct = goal > 0 ? Math.min(100, (saved / goal) * 100) : 0;
  return { saved, pct };
}

export function groupByDay(list: Transaction[]): Array<{ date: string; items: Transaction[] }> {
  const groups: Array<{ date: string; items: Transaction[] }> = [];
  for (const t of list) {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

export function previousBalance(all: Transaction[], month: string): { list: Transaction[]; balance: number } {
  const list = monthTransactions(all, month);
  return { list, balance: totalsOf(list).balance };
}

export function distinctMonths(all: Transaction[]): number {
  return new Set(all.map((t) => monthOf(t.date))).size;
}

