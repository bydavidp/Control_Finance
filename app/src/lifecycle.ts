import { cloud, setStatus } from "./cloud/status";
import { syncNow } from "./cloud/sync";
import { hasPin, LOCK_AFTER_MS } from "./auth/pin";
import { lockNow } from "./auth/session";

export function startLifecycle(): void {
  let hiddenAt = 0;

  setInterval(() => {
    if (cloud.uid && !cloud.syncing && document.visibilityState === "visible" && navigator.onLine) {
      void syncNow(true);
    }
  }, 30_000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (cloud.uid && hasPin(cloud.uid) && Date.now() - hiddenAt > LOCK_AFTER_MS) lockNow();
    if (cloud.uid) void syncNow(true);
  });

  window.addEventListener("online", () => {
    if (cloud.uid) void syncNow(true);
  });
  window.addEventListener("offline", () => {
    if (cloud.uid) setStatus("offline");
  });
}
