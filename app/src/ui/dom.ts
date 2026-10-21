export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento no encontrado: ${sel}`);
  return el;
};

export const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  [...root.querySelectorAll<T>(sel)];

export function setText(sel: string, text: string): void {
  const el = document.querySelector<HTMLElement>(sel);
  if (el && el.textContent !== text) el.textContent = text;
}

export function setHidden(sel: string, hidden: boolean): void {
  const el = document.querySelector<HTMLElement>(sel);
  if (el) el.hidden = hidden;
}

export function setInputValue(sel: string, value: string): void {
  const el = document.querySelector<HTMLInputElement>(sel);
  if (el && document.activeElement !== el && el.value !== value) el.value = value;
}

export function setMsg(sel: string, text: string, tone: "" | "ok" | "error" = ""): void {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return;
  el.textContent = text;
  el.className = el.className.replace(/\b(ok|error)\b/g, "").trim();
  if (tone) el.classList.add(tone);
}
