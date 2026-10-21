import { store, notify } from "../store/store";
import { gateMode, type GateMode } from "../auth/gate";
import { PIN_MAX_FAILS, failsOf, verifyPin } from "../auth/pin";
import { cloud } from "../cloud/status";
import { signInWithPassword, signUpWithPassword, requestPasswordReset, setNewPassword, unlockApp } from "../auth/session";
import { $, setMsg, setText, setHidden } from "./dom";
import { toast } from "./toast";

let pinInput = "";
let pinBusy = false;
let lastMode: GateMode = "";

function readField(sel: string): string {
  return $<HTMLInputElement>(sel).value;
}

function emailOk(email: string): boolean {
  return email.includes("@") && email.includes(".");
}

function passwordOk(password: string): boolean {
  return password.length >= 6;
}

export function renderGate(): void {
  const gate = document.getElementById("gate");
  if (!gate) return;
  const mode = gateMode();
  if (mode === lastMode) return;
  const wasOpen = lastMode !== "";
  lastMode = mode;
  gate.dataset.mode = mode;

  gate.hidden = mode === "";
  setHidden("#gate-loading", mode !== "loading");
  setHidden("#gate-login", mode !== "login");
  setHidden("#gate-recovery", mode !== "recovery");
  setHidden("#gate-pin", mode !== "pin");
  pinInput = "";
  renderPinDots();
  setMsg("#gate-pin-msg", "");
  setMsg("#gate-msg", "");
  setMsg("#gate-recovery-msg", "");
  if (mode === "login") renderLoginForm();

  if (wasOpen && mode === "" && !store.state.onboarded && store.ui.sheet === null) {
    store.ui.sheet = "welcome";
    notify();
  }
}

export function renderLoginForm(): void {
  const signup = cloud.signupMode && !cloud.uid;
  setText("#gate-title", signup ? "Crea tu cuenta" : "Inicia sesión");
  setText("#gate-hint", cloud.uid
    ? "Inicia sesión con tu contraseña para continuar."
    : signup
      ? "Tus finanzas se guardan en tu cuenta y se sincronizan entre tus dispositivos."
      : "Entra con tu email y contraseña para ver tus finanzas.");
  setHidden("#gate-name-field", !signup);
  setText("#gate-submit", signup ? "Crear cuenta" : "Entrar");
  setHidden("#gate-forgot", signup);
  setHidden("#gate-toggle", Boolean(cloud.uid));
  setText("#gate-toggle", signup ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Regístrate");
}

export function toggleSignupMode(): void {
  cloud.signupMode = !cloud.signupMode;
  renderLoginForm();
  setMsg("#gate-msg", "");
}

export function togglePassword(button: HTMLElement): void {
  const input = button.closest(".pw-wrap")?.querySelector<HTMLInputElement>("input");
  if (!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  button.textContent = show ? "Ocultar" : "Ver";
  button.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
}

export async function submitLogin(): Promise<void> {
  const email = readField("#gate-email").trim();
  const password = readField("#gate-password");
  if (!emailOk(email)) return setMsg("#gate-msg", "Escribe un email válido.", "error");
  if (!passwordOk(password)) return setMsg("#gate-msg", "La contraseña debe tener al menos 6 caracteres.", "error");

  setMsg("#gate-msg", "Entrando…");
  const result = await signInWithPassword(email, password);
  if (!result.ok) return setMsg("#gate-msg", result.message, "error");
  $<HTMLInputElement>("#gate-password").value = "";
  setMsg("#gate-msg", "");
}

export async function submitSignup(): Promise<void> {
  const email = readField("#gate-email").trim();
  const password = readField("#gate-password");
  const name = readField("#gate-name").trim().slice(0, 24) || email.split("@")[0] || "David";
  if (!emailOk(email)) return setMsg("#gate-msg", "Escribe un email válido.", "error");
  if (!passwordOk(password)) return setMsg("#gate-msg", "La contraseña debe tener al menos 6 caracteres.", "error");

  setMsg("#gate-msg", "Creando cuenta…");
  const result = await signUpWithPassword(email, password, name, store.state.settings.goal);
  if (!result.ok) return setMsg("#gate-msg", result.message, "error");
  if (result.needsConfirmation) return setMsg("#gate-msg", result.message, "ok");
  $<HTMLInputElement>("#gate-password").value = "";
  setMsg("#gate-msg", "");
}

export async function forgotPassword(): Promise<void> {
  const email = readField("#gate-email").trim();
  if (!emailOk(email)) return setMsg("#gate-msg", "Escribe tu email para enviarte el enlace.", "error");
  setMsg("#gate-msg", "Enviando enlace…");
  const result = await requestPasswordReset(email);
  setMsg("#gate-msg", result.message, result.ok ? "ok" : "error");
}

export async function submitNewPassword(): Promise<void> {
  const password = readField("#gate-new-password");
  if (!passwordOk(password)) return setMsg("#gate-recovery-msg", "La contraseña debe tener al menos 6 caracteres.", "error");
  setMsg("#gate-recovery-msg", "Guardando…");
  const result = await setNewPassword(password);
  if (!result.ok) return setMsg("#gate-recovery-msg", result.message, "error");
  $<HTMLInputElement>("#gate-new-password").value = "";
  toast("Contraseña actualizada");
}

function renderPinDots(): void {
  document.querySelectorAll<HTMLElement>("#pin-dots span").forEach((dot, i) => {
    dot.classList.toggle("filled", i < pinInput.length);
  });
}

function wrongPinFeedback(): void {
  const dots = document.getElementById("pin-dots");
  if (!dots) return;
  dots.classList.remove("wrong");
  void dots.offsetWidth;
  dots.classList.add("wrong");
  setTimeout(() => dots.classList.remove("wrong"), 500);
}

export async function pressPinKey(key: string): Promise<void> {
  if (pinBusy || gateMode() !== "pin" || !cloud.uid) return;
  if (key === "back") pinInput = pinInput.slice(0, -1);
  else if (pinInput.length < 4) pinInput += key;
  renderPinDots();
  if (pinInput.length < 4) return;

  pinBusy = true;
  const uid = cloud.uid;
  let ok = false;
  try {
    ok = await verifyPin(uid, pinInput);
  } finally {
    pinInput = "";
    renderPinDots();
    pinBusy = false;
  }

  if (ok) {
    setMsg("#gate-pin-msg", "");
    unlockApp();
    return;
  }
  wrongPinFeedback();
  const left = PIN_MAX_FAILS - failsOf(uid);
  if (left > 0) {
    setMsg("#gate-pin-msg", `PIN incorrecto. Te quedan ${left} intentos.`, "error");
  } else {
    setMsg("#gate-msg", "Demasiados intentos. Inicia sesión con tu contraseña.", "error");
    cloud.passwordFallback = true;
    notify();
  }
}

export function usePasswordInstead(): void {
  cloud.passwordFallback = true;
  notify();
}
