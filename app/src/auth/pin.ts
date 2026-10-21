export const PIN_MAX_FAILS = 5;
export const LOCK_AFTER_MS = 60_000;

interface PinRecord {
  salt: string;
  hash: string;
  fails: number;
}

const keyFor = (uid: string): string => "cf.pin." + uid;

export function readPin(uid: string | null): PinRecord | null {
  if (!uid) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(uid)) ?? "null") as Partial<PinRecord> | null;
    if (!raw || typeof raw.salt !== "string" || typeof raw.hash !== "string") return null;
    return { salt: raw.salt, hash: raw.hash, fails: Number(raw.fails) || 0 };
  } catch {
    return null;
  }
}

function writePin(uid: string, record: PinRecord): void {
  localStorage.setItem(keyFor(uid), JSON.stringify(record));
}

export function hasPin(uid: string | null): boolean {
  return readPin(uid) !== null;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const pairs = hex.match(/../g) ?? [];
  const out = new Uint8Array(new ArrayBuffer(pairs.length));
  pairs.forEach((h, i) => {
    out[i] = parseInt(h, 16);
  });
  return out;
}

async function derive(pin: string, saltHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: 150_000 },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function setPin(uid: string, pin: string): Promise<void> {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  writePin(uid, { salt, hash: await derive(pin, salt), fails: 0 });
}

export function removePin(uid: string): void {
  localStorage.removeItem(keyFor(uid));
}

export function clearFails(uid: string): void {
  const record = readPin(uid);
  if (record && record.fails) writePin(uid, { ...record, fails: 0 });
}

export function failsOf(uid: string | null): number {
  return readPin(uid)?.fails ?? 0;
}

/** Devuelve true si el PIN coincide. Cuenta los intentos fallidos. */
export async function verifyPin(uid: string, pin: string): Promise<boolean> {
  const record = readPin(uid);
  if (!record) return false;
  const ok = (await derive(pin, record.salt)) === record.hash;
  if (!ok) writePin(uid, { ...record, fails: record.fails + 1 });
  else if (record.fails) writePin(uid, { ...record, fails: 0 });
  return ok;
}
