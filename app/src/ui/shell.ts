export function applyStaticMode(): void {
  if (new URLSearchParams(location.search).get("static") === "1") {
    document.body.classList.add("static");
  }
}
