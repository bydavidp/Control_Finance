import type { CategoryDef, TxType } from "./types";

export const CATEGORIES: Record<TxType, CategoryDef[]> = {
  expense: [
    { name: "Comida", color: "#F5B94A" },
    { name: "Transporte", color: "#4FC3F7" },
    { name: "Hogar", color: "#A78BFA" },
    { name: "Ocio", color: "#FB923C" },
    { name: "Salud", color: "#34D399" },
    { name: "Compras", color: "#F472B6" },
    { name: "Otros", color: "#94A3B8" },
  ],
  income: [
    { name: "Salario", color: "#34D399" },
    { name: "Freelance", color: "#5B8CFF" },
    { name: "Ventas", color: "#F5B94A" },
    { name: "Regalo", color: "#A78BFA" },
    { name: "Otros", color: "#94A3B8" },
  ],
};

export function categoriesFor(type: TxType): CategoryDef[] {
  return CATEGORIES[type];
}

export function categoryColor(type: TxType, name: string): string {
  const list = CATEGORIES[type];
  return (list.find((c) => c.name === name) ?? list[list.length - 1] ?? { color: "#94A3B8" }).color;
}
