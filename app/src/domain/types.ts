export type TxType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string;
  createdAt: number;
}

export interface Settings {
  name: string;
  goal: number;
}

export type PendingOp =
  | { op: "upsert"; tx: Transaction }
  | { op: "delete"; id: string }
  | { op: "settings"; settings: Settings }
  | { op: "replace"; transactions: Transaction[] }
  | { op: "reset" };

export interface AppState {
  version: 1;
  onboarded: boolean;
  settings: Settings;
  transactions: Transaction[];
  pending: PendingOp[];
}

export interface CategoryDef {
  name: string;
  color: string;
}

export type Filter = "Todas" | "Ingresos" | "Gastos";
export type TabId = "home" | "movimientos" | "perfil";
