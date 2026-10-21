import type { Session } from "@supabase/supabase-js";
import { notify, store, persist } from "../store/store";
import { toast } from "../ui/toast";
import { supabase, siteUrl } from "../cloud/client";
import { cloud, setStatus } from "../cloud/status";
import { bootstrapCloud, syncNow, unsubscribeRealtime } from "../cloud/sync";
import { hasPin, clearFails } from "./pin";

export interface AuthResult {
  ok: boolean;
  message: string;
  needsConfirmation?: boolean;
}

export function translateAuthError(message: string): string {
  const text = String(message || "");
  if (/invalid login credentials/i.test(text)) return "Email o contraseña incorrectos.";
  if (/email not confirmed/i.test(text)) return "Confirma tu correo antes de entrar.";
  if (/user already registered/i.test(text)) return "Ese email ya tiene cuenta. Inicia sesión.";
  if (/password should be at least/i.test(text)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/unable to validate email|invalid email/i.test(text)) return "Escribe un email válido.";
  if (/security purposes|rate limit|seconds/i.test(text)) return "Espera un minuto antes de volver a intentarlo.";
  if (/should be different/i.test(text)) return "La contraseña nueva debe ser distinta a la anterior.";
  if (/fetch|network|failed/i.test(text)) return "Sin conexión. Inténtalo de nuevo.";
  return text || "No se pudo completar la operación.";
}

export function unlockApp(): void {
  cloud.unlocked = true;
  cloud.passwordFallback = false;
  if (cloud.uid) clearFails(cloud.uid);
  notify();
}

export async function onSignedIn(session: Session | null): Promise<void> {
  if (!session?.user || !supabase) return;
  if (cloud.uid === session.user.id && cloud.status === "synced") return;
  if (cloud.connecting) return;

  cloud.connecting = true;
  cloud.uid = session.user.id;
  cloud.email = session.user.email ?? "";
  localStorage.setItem("cf.lastEmail", cloud.email);
  setStatus("connecting");

  try {
    await bootstrapCloud();
    setStatus("synced");
    notify();
  } catch (error) {
    console.error("Nube:", error);
    setStatus("error", error instanceof Error ? error.message : "");
    toast("No se pudo sincronizar con la nube");
  } finally {
    cloud.connecting = false;
    if (cloud.syncAgain) {
      cloud.syncAgain = false;
      setTimeout(() => void syncNow(true), 100);
    }
  }
}

export function onSignedOut(): void {
  unsubscribeRealtime();
  cloud.uid = null;
  cloud.email = "";
  cloud.quickToken = "";
  cloud.hasQuickToken = false;
  cloud.lastSync = null;
  cloud.connecting = false;
  cloud.syncing = false;
  cloud.syncAgain = false;
  cloud.unlocked = false;
  cloud.passwordFallback = false;
  setStatus("local");
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Nube no configurada" };
  setStatus("connecting");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(cloud.uid ? "error" : "local", error.message);
    return { ok: false, message: translateAuthError(error.message) };
  }
  unlockApp();
  await onSignedIn(data.session);
  return { ok: true, message: "" };
}

export async function signUpWithPassword(email: string, password: string, name: string, goal: number): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Nube no configurada" };
  setStatus("connecting");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, goal } },
  });
  if (error) {
    setStatus(cloud.uid ? "error" : "local", error.message);
    return { ok: false, message: translateAuthError(error.message) };
  }
  if (!data.session) {
    setStatus("local");
    return {
      ok: true,
      needsConfirmation: true,
      message: "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.",
    };
  }
  store.state.settings.name = name;
  persist();
  unlockApp();
  await onSignedIn(data.session);
  return { ok: true, message: "" };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Nube no configurada" };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
  if (error) return { ok: false, message: translateAuthError(error.message) };
  return { ok: true, message: "Listo. Revisa tu correo y abre el enlace para crear una nueva contraseña." };
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: "Nube no configurada" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: translateAuthError(error.message) };
  cloud.recovery = false;
  unlockApp();
  return { ok: true, message: "Contraseña actualizada" };
}

export async function signOut(): Promise<void> {
  try {
    if (supabase) await supabase.auth.signOut();
  } catch (error) {
    console.warn(error);
  }
  onSignedOut();
}

export function isLocked(): boolean {
  return Boolean(cloud.uid && hasPin(cloud.uid) && !cloud.unlocked);
}

export function lockNow(): void {
  if (!cloud.uid || !hasPin(cloud.uid)) return;
  cloud.unlocked = false;
  cloud.passwordFallback = false;
  notify();
}
