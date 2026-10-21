import type { RealtimeChannel } from "@supabase/supabase-js";
import { notify } from "../store/store";
import { supabase } from "./client";

export type CloudStatus = "local" | "connecting" | "syncing" | "synced" | "offline" | "error";

export const cloud = {
  enabled: supabase !== null,
  checked: false,
  uid: null as string | null,
  email: "",
  status: "local" as CloudStatus,
  message: "",
  lastSync: null as number | null,
  syncing: false,
  connecting: false,
  syncAgain: false,
  channel: null as RealtimeChannel | null,
  quickToken: "",
  hasQuickToken: false,
  unlocked: false,
  passwordFallback: false,
  recovery: false,
  signupMode: false,
};

export function setStatus(status: CloudStatus, message = ""): void {
  cloud.status = status;
  cloud.message = message;
  notify();
}

export const STATUS_LABEL: Record<CloudStatus, string> = {
  local: "Local",
  connecting: "Conectando",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  offline: "Sin conexión",
  error: "Error",
};
