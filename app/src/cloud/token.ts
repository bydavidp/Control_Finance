import { supabase } from "./client";
import { cloud } from "./status";

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createQuickToken(): Promise<{ ok: boolean; message: string; token?: string }> {
  if (!supabase || !cloud.uid) return { ok: false, message: "Inicia sesión primero" };
  if (!crypto.subtle) return { ok: false, message: "Este navegador no permite generar el token" };

  const token = randomToken();
  const hash = await sha256Hex(token);
  const { error } = await supabase.from("profiles").update({ quick_token_hash: hash }).eq("id", cloud.uid);
  if (error) return { ok: false, message: "No se pudo generar el token" };

  cloud.quickToken = token;
  cloud.hasQuickToken = true;
  localStorage.setItem("cf.quickToken." + cloud.uid, token);
  return { ok: true, message: "Token generado", token };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function shortcutConfig(token: string, today: string): string {
  const payload = {
    url: `${import.meta.env.VITE_SUPABASE_URL ?? ""}/rest/v1/rpc/cf_quick_add`,
    method: "POST",
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: {
      p_token: token,
      p_amount: 25000,
      p_type: "expense",
      p_category: "Comida",
      p_note: "Café",
      p_date: today,
    },
  };
  return JSON.stringify(payload, null, 2);
}
