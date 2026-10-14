// Record types and builders. Mirrors core/schema/record.schema.json. Pure, no DOM.
// Records are append-only: an edit is a new record whose `supersedes` points at the one it corrects.
import type { Depth, Side } from "./body/naming";
import type { View } from "./body/coords";

export type Kind = "episode" | "visit" | "note";
export type Shape = "point" | "patch" | "line" | "radiating";
export type Onset = "sudden" | "gradual" | "unknown";
export type Pattern = "constant" | "comes_and_goes" | "once";
export type TestResult = "normal" | "abnormal" | "pending" | "unknown";

export interface Location { part_id: string; side: Side; local: [number, number, number]; depth: Depth; view?: View }
export interface Mark { location: Location; shape: Shape; intensity: number; radius?: number; to?: Location; descriptors?: string[]; note?: string }
export interface Context { activity?: string; onset?: Onset; triggers?: string[]; relief?: string[]; associated?: string[]; pattern?: Pattern }
export interface Mind { stress?: number | null; mood?: number | null; sleep_hours?: number | null; note?: string }
export interface Visit { clinician?: string; department: string; said?: string; did?: string; next?: string | null }
export interface Test { name: string; result: TestResult; date?: string | null; note?: string }
export interface Rec {
  schema_version: "1.0";
  id: string;
  kind: Kind;
  created_at: string;
  started_at: string;
  ended_at?: string | null;
  supersedes?: string | null;
  model_version?: string;
  marks?: Mark[];
  context?: Context;
  mind?: Mind;
  visit?: Visit;
  tests?: Test[];
  note?: string;
}

export const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });

const p2 = (n: number) => String(n).padStart(2, "0");
/** ISO-8601 with the device's UTC offset, second precision. The schema wants offsets; `toISOString()` would drop them. */
export function isoLocal(d: Date = new Date()): string {
  const o = -d.getTimezoneOffset(), s = o >= 0 ? "+" : "-", a = Math.abs(o);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${s}${p2(Math.floor(a / 60))}:${p2(a % 60)}`;
}
/** For <input type="datetime-local"> (local wall time, no offset). */
export const toInputDT = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fromInputDT = (v: string) => (v ? isoLocal(new Date(v)) : null);

export function newRecord(kind: Kind, extra: Partial<Rec> = {}): Rec {
  const now = isoLocal();
  const r: Rec = { schema_version: "1.0", id: uuid(), kind, created_at: now, started_at: now, ...extra };
  if (kind === "episode" && r.ended_at === undefined) r.ended_at = null;
  return clean(r);
}

/** A corrected copy: new id, `supersedes` = the old id, fields merged. The old record stays in storage. */
export function revise(r: Rec, patch: Partial<Rec>): Rec {
  return clean({ ...r, ...patch, id: uuid(), supersedes: r.id, created_at: isoLocal() });
}

/** Drop undefined / empty optional fields so the result validates against additionalProperties:false and minItems. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clean) as unknown as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x === undefined) continue;
      if (typeof x === "string" && x === "" && !["department", "name"].includes(k)) continue;
      if (Array.isArray(x) && x.length === 0 && !["marks", "tests"].includes(k)) continue;
      const c = clean(x);
      if (c && typeof c === "object" && !Array.isArray(c) && Object.keys(c as object).length === 0 && !["context", "mind"].includes(k)) continue;
      o[k] = c;
    }
    return o as T;
  }
  return v;
}

export const isOpen = (r: Rec) => r.kind === "episode" && !r.ended_at;

/** Minimal structural check for imported data. Not a full JSON-Schema validator; the schema file is the contract. */
export function looksLikeRecord(x: unknown): x is Rec {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  if (r.schema_version !== "1.0" || typeof r.id !== "string" || r.id.length < 8) return false;
  if (!["episode", "visit", "note"].includes(r.kind as string)) return false;
  if (typeof r.created_at !== "string" || typeof r.started_at !== "string") return false;
  if (r.marks !== undefined) {
    if (!Array.isArray(r.marks) || r.marks.length > 12) return false;
    for (const m of r.marks as Mark[]) {
      if (!m?.location || !Array.isArray(m.location.local) || m.location.local.length !== 3) return false;
      if (!Number.isInteger(m.intensity) || m.intensity < 0 || m.intensity > 10) return false;
      if (!["point", "patch", "line", "radiating"].includes(m.shape)) return false;
    }
  }
  if (r.kind === "visit" && typeof (r.visit as Visit | undefined)?.department !== "string") return false;
  return true;
}
