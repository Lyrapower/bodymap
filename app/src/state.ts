// App state: all records (every version), the record being added to, and settings. One change event.
import { effective } from "../../core/export/export.mjs";
import { store, chainOf } from "./store/db";
import { revise, newRecord, type Rec, type Mark, type Kind } from "./records";

export type Region = "CN" | "US" | "other";
type Listener = () => void;

const LS_CUR = "bodymap.currentId", LS_REGION = "bodymap.region";

class State {
  all: Rec[] = [];
  currentId: string | null = null;
  region: Region = defaultRegion();
  modelVersion = "unknown";
  private listeners = new Set<Listener>();

  async load() {
    this.all = await store.all();
    try { this.currentId = localStorage.getItem(LS_CUR); } catch { /* ignore */ }
    try { const r = localStorage.getItem(LS_REGION); if (r === "CN" || r === "US" || r === "other") this.region = r; } catch { /* ignore */ }
    if (this.currentId && !this.current) this.setCurrent(null);
    this.emit();
  }
  onChange(f: Listener) { this.listeners.add(f); return () => this.listeners.delete(f); }
  private emit() { this.listeners.forEach((f) => f()); }

  /** Latest versions only, oldest first. */
  get effective(): Rec[] { return effective(this.all) as Rec[]; }
  get current(): Rec | null { return this.currentId ? this.effective.find((r) => r.id === this.currentId) ?? null : null; }
  byId(id: string) { return this.all.find((r) => r.id === id) ?? null; }
  /** Newest version of the logical record `r` belongs to (follows supersedes forward). */
  latest(r: Rec): Rec { const ids = new Set(chainOf(this.all, r.id)); return this.effective.find((x) => ids.has(x.id)) ?? r; }

  setCurrent(id: string | null) {
    this.currentId = id;
    try { id ? localStorage.setItem(LS_CUR, id) : localStorage.removeItem(LS_CUR); } catch { /* ignore */ }
    this.emit();
  }
  setRegion(r: Region) { this.region = r; try { localStorage.setItem(LS_REGION, r); } catch { /* ignore */ } this.emit(); }

  /** Append a brand-new record. */
  async add(kind: Kind, extra: Partial<Rec> = {}): Promise<Rec> {
    const r = newRecord(kind, { model_version: this.modelVersion, ...extra });
    await store.put(r);
    this.all.push(r);
    this.emit();
    return r;
  }
  /** Correct a record: a new version is appended, the old one stays. The current pointer follows. */
  async update(r: Rec, patch: Partial<Rec>): Promise<Rec> {
    const next = revise(r, patch);
    await store.put(next);
    this.all.push(next);
    if (this.currentId === r.id) this.setCurrent(next.id); else this.emit();
    return next;
  }
  async setMarks(r: Rec, marks: Mark[]) { return this.update(r, { marks: marks.slice(0, 12) }); }

  /** Delete every version of a record. The only non-append operation; always behind a confirm in the UI. */
  async remove(id: string) {
    const ids = chainOf(this.all, id);
    await store.remove(ids);
    const drop = new Set(ids);
    this.all = this.all.filter((r) => !drop.has(r.id));
    if (this.currentId && drop.has(this.currentId)) this.setCurrent(null); else this.emit();
  }
  async importRecords(rs: Rec[]): Promise<{ added: number; skipped: number }> {
    const have = new Set(this.all.map((r) => r.id));
    const fresh = rs.filter((r) => !have.has(r.id));
    if (fresh.length) { await store.putMany(fresh); this.all.push(...fresh); this.emit(); }
    return { added: fresh.length, skipped: rs.length - fresh.length };
  }
}

function defaultRegion(): Region {
  const l = (navigator.language || "").toLowerCase();
  if (l.startsWith("zh")) return "CN";
  if (l.endsWith("-us")) return "US";
  return "other";
}

export const state = new State();
