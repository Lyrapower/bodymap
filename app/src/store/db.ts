// Local storage of records. IndexedDB, append-only (put never overwrites a different id).
// No network, no account. If IndexedDB is unavailable (some private windows), falls back to localStorage.
import { looksLikeRecord, type Rec } from "../records";

const DB = "bodymap", STORE = "records", LS = "bodymap.records";

let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    let out: T | undefined;
    const r = run(t.objectStore(STORE));
    if (r) r.onsuccess = () => (out = r.result);
    t.oncomplete = () => resolve(out as T);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const lsRead = (): Rec[] => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };
const lsWrite = (rs: Rec[]) => { try { localStorage.setItem(LS, JSON.stringify(rs)); } catch { /* full or blocked */ } };

export const store = {
  async all(): Promise<Rec[]> {
    const db = await open();
    if (!db) return lsRead();
    const rows = await tx<Rec[]>(db, "readonly", (s) => s.getAll());
    return rows.filter(looksLikeRecord);
  },
  async put(r: Rec): Promise<void> { await this.putMany([r]); },
  async putMany(rs: Rec[]): Promise<void> {
    const db = await open();
    if (!db) { const cur = lsRead(); const ids = new Set(cur.map((x) => x.id)); lsWrite([...cur, ...rs.filter((x) => !ids.has(x.id))]); return; }
    await tx(db, "readwrite", (s) => { for (const r of rs) s.add(r); });
  },
  async remove(ids: string[]): Promise<void> {
    const db = await open();
    if (!db) { const drop = new Set(ids); lsWrite(lsRead().filter((x) => !drop.has(x.id))); return; }
    await tx(db, "readwrite", (s) => { for (const id of ids) s.delete(id); });
  },
};

/** All versions of one logical record: walk `supersedes` back and forward. */
export function chainOf(all: Rec[], id: string): string[] {
  const byId = new Map(all.map((r) => [r.id, r]));
  const out = new Set<string>();
  let cur: Rec | undefined = byId.get(id);
  while (cur && !out.has(cur.id)) { out.add(cur.id); cur = cur.supersedes ? byId.get(cur.supersedes) : undefined; }
  let grew = true;
  while (grew) { grew = false; for (const r of all) if (r.supersedes && out.has(r.supersedes) && !out.has(r.id)) { out.add(r.id); grew = true; } }
  return [...out];
}

export interface Backup { format: "bodymap-backup"; schema_version: "1.0"; exported_at: string; app_version?: string; locale?: "zh" | "en"; region?: "CN" | "US" | "other"; records: Rec[] }
export function parseBackup(text: string): Backup | null {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const b = j as Record<string, unknown>;
  if (b.format !== "bodymap-backup" || b.schema_version !== "1.0" || !Array.isArray(b.records)) return null;
  const records = (b.records as unknown[]).filter(looksLikeRecord);
  return { format: "bodymap-backup", schema_version: "1.0", exported_at: String(b.exported_at ?? ""), records };
}
