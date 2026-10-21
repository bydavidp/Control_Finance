export async function removeOldCaches(): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((k) => k.startsWith("control-finance-")).map((k) => caches.delete(k)),
  );
}
