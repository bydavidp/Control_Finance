export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const pad = (n: number): string => String(n).padStart(2, "0");

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayISO = (): string => isoDate(new Date());
export const monthOf = (date: string): string => date.slice(0, 7);
export const currentMonth = (): string => monthOf(todayISO());

export function parseDate(str: string): Date {
  const [y = 1970, m = 1, d = 1] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftMonth(key: string, delta: number): string {
  const [y = 1970, m = 1] = key.split("-").map(Number);
  return monthOf(isoDate(new Date(y, m - 1 + delta, 1)));
}

export function monthName(key: string, withYear = false): string {
  const [y = 1970, m = 1] = key.split("-").map(Number);
  return (MONTHS[m - 1] ?? "") + (withYear ? ` de ${y}` : "");
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function money(n: number): string {
  return "$ " + Math.round(Math.abs(n)).toLocaleString("es-CO");
}

export function signedMoney(n: number): string {
  return (n < 0 ? "−" : "") + money(n);
}

export function compactMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const value = (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${sign}$ ${value} M`;
  }
  if (abs >= 1000) return `${sign}$ ${Math.round(abs / 1000)} k`;
  return sign + money(abs);
}

export function shortAmount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(Math.round(n));
}

export function dateLabel(dateStr: string, today = todayISO()): string {
  if (dateStr === today) return "Hoy";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === isoDate(yesterday)) return "Ayer";
  const d = parseDate(dateStr);
  return `${d.getDate()} ${(MONTHS[d.getMonth()] ?? "").slice(0, 3)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p.charAt(0)).join("") || "CF").toUpperCase();
}

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => (
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c] ?? c
  ));
}

export function uid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "tx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
