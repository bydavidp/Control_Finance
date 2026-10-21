let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}
