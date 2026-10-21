import type { Transaction, PendingOp } from "../domain/types";
import { byDateDesc } from "../domain/calc";
import { store, enqueue, notify, persist } from "../store/store";
import { toast } from "../ui/toast";
import { supabase, realtimeEnabled } from "./client";
import { cloud, setStatus } from "./status";
import { fromCloud, toCloud, type CloudRow } from "./mapping";

let syncTimer: ReturnType<typeof setTimeout> | undefined;

type DbError = { message: string } | null;

function db() {
  if (!supabase) throw new Error("Nube no configurada");
  return supabase;
}

export function enqueueCloud(op: PendingOp): void {
  if (!cloud.uid) return;
  enqueue(op);
  scheduleSync();
}

export function scheduleSync(delay = 600): void {
  if (!cloud.uid || !cloud.enabled) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(true), delay);
}

async function applyOp(op: PendingOp): Promise<DbError> {
  const client = db();
  const uid = cloud.uid;
  if (op.op === "upsert") {
    const { error } = await client.from("transactions").upsert(toCloud(op.tx, uid), { onConflict: "id" });
    return error;
  }
  if (op.op === "delete") {
    const { error } = await client.from("transactions").delete().eq("id", op.id);
    return error;
  }
  if (op.op === "settings") {
    const { error } = await client.from("profiles")
      .update({ name: op.settings.name, goal: op.settings.goal })
      .eq("id", uid ?? "");
    return error;
  }
  if (op.op === "replace") {
    const removed = await client.from("transactions").delete().eq("user_id", uid ?? "");
    if (removed.error) return removed.error;
    const rows = op.transactions.map((t) => toCloud(t, uid));
    for (let i = 0; i < rows.length; i += 200) {
      const inserted = await client.from("transactions").insert(rows.slice(i, i + 200));
      if (inserted.error) return inserted.error;
    }
    return null;
  }
  const removed = await client.from("transactions").delete().eq("user_id", uid ?? "");
  if (removed.error) return removed.error;
  const profile = await client.from("profiles")
    .update({ name: "David", goal: 2000000, quick_token_hash: null })
    .eq("id", uid ?? "");
  if (profile.error) return profile.error;
  cloud.hasQuickToken = false;
  cloud.quickToken = "";
  if (uid) localStorage.removeItem("cf.quickToken." + uid);
  return null;
}

export async function flushQueue(): Promise<void> {
  while (store.state.pending.length) {
    const op = store.state.pending[0];
    if (!op) break;
    const error = await applyOp(op);
    if (error) throw new Error(error.message);
    store.state.pending.shift();
    persist();
  }
}

export async function pullCloud(): Promise<void> {
  const { data, error } = await db()
    .from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const remote = ((data ?? []) as CloudRow[]).map(fromCloud);
  const pending = store.state.pending;
  const pendingDeletes = new Set(pending.flatMap((op) => (op.op === "delete" ? [op.id] : [])));
  const pendingUpserts: Transaction[] = pending.flatMap((op) => (op.op === "upsert" ? [op.tx] : []));

  const map = new Map(remote.filter((t) => !pendingDeletes.has(t.id)).map((t) => [t.id, t] as const));
  for (const tx of pendingUpserts) map.set(tx.id, tx);

  store.state.transactions = [...map.values()].sort(byDateDesc);
  persist();
  notify();
}

async function ensureProfile(): Promise<void> {
  const client = db();
  const select = "id,name,goal,quick_token_hash";
  const found = await client.from("profiles").select(select).eq("id", cloud.uid ?? "").maybeSingle();
  if (found.error) throw new Error(found.error.message);
  let profile = found.data;

  if (!profile) {
    const inserted = await client.from("profiles")
      .insert({ id: cloud.uid, name: store.state.settings.name, goal: store.state.settings.goal })
      .select(select)
      .maybeSingle();
    if (inserted.error) throw new Error(inserted.error.message);
    profile = inserted.data;
  }

  if (profile) {
    cloud.hasQuickToken = Boolean(profile.quick_token_hash);
    if (profile.name) store.state.settings.name = String(profile.name);
    if (profile.goal != null) store.state.settings.goal = Number(profile.goal) || 0;
  }
  cloud.quickToken = localStorage.getItem("cf.quickToken." + (cloud.uid ?? "")) ?? "";
  persist();
}

async function initialSync(): Promise<void> {
  const client = db();
  const { data, error } = await client.from("transactions").select("*");
  if (error) throw new Error(error.message);

  const remote = ((data ?? []) as CloudRow[]).map(fromCloud);
  const remoteIds = new Set(remote.map((t) => t.id));
  const localOnly = store.state.transactions.filter((t) => !remoteIds.has(t.id));

  if (localOnly.length) {
    const { error: uploadError } = await client.from("transactions")
      .upsert(localOnly.map((t) => toCloud(t, cloud.uid)), { onConflict: "id" });
    if (uploadError) throw new Error(uploadError.message);
  }

  const map = new Map(remote.map((t) => [t.id, t] as const));
  store.state.transactions.forEach((t) => {
    if (!map.has(t.id)) map.set(t.id, t);
  });
  store.state.transactions = [...map.values()].sort(byDateDesc);

  await flushQueue();
  await pullCloud();
}

export async function bootstrapCloud(): Promise<void> {
  await ensureProfile();
  await initialSync();
  subscribeRealtime();
  cloud.lastSync = Date.now();
}

export async function syncNow(silent = false): Promise<void> {
  if (!cloud.uid || !supabase) return;
  if (cloud.connecting || cloud.syncing) {
    cloud.syncAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setStatus("offline");
    if (!silent) toast("Sin conexión");
    return;
  }

  cloud.syncing = true;
  setStatus("syncing");
  try {
    await flushQueue();
    await pullCloud();
    cloud.lastSync = Date.now();
    setStatus("synced");
  } catch (error) {
    console.error("Sync:", error);
    setStatus("error", error instanceof Error ? error.message : "");
    if (!silent) toast("No se pudo sincronizar");
  } finally {
    cloud.syncing = false;
    notify();
    if (cloud.syncAgain) {
      cloud.syncAgain = false;
      setTimeout(() => void syncNow(true), 100);
    }
  }
}

export function subscribeRealtime(): void {
  const client = supabase;
  if (!client || !cloud.uid || !realtimeEnabled) return;
  if (cloud.channel) void client.removeChannel(cloud.channel);
  cloud.channel = client.channel("cf-" + cloud.uid)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "transactions",
      filter: `user_id=eq.${cloud.uid}`,
    }, () => scheduleSync(300))
    .subscribe();
}

export function unsubscribeRealtime(): void {
  if (cloud.channel && supabase) void supabase.removeChannel(cloud.channel);
  cloud.channel = null;
}
