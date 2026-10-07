// All visible text goes through t(). Source of truth: core/i18n/ui.json (owned by 钉).
// ui.pending.json holds keys the app needs before they land in core.
import core from "../../core/i18n/ui.json";
import pending from "./i18n/ui.pending.json";

export type Locale = "zh" | "en";
type Table = Record<string, { zh: string; en: string } | string>;
const CORE = core as unknown as Table;
const PENDING = pending as unknown as Table;

let locale: Locale = initialLocale();
const listeners = new Set<() => void>();

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("bodymap.locale");
    if (saved === "zh" || saved === "en") return saved;
  } catch { /* storage may be blocked */ }
  return (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function t(key: string, l: Locale = locale): string {
  const e = CORE[key] ?? PENDING[key];
  if (!e || typeof e === "string") return key;
  return e[l] ?? e.en;
}
export const getLocale = () => locale;
export function setLocale(l: Locale) {
  locale = l;
  try { localStorage.setItem("bodymap.locale", l); } catch { /* ignore */ }
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  listeners.forEach((f) => f());
}
export const onLocale = (f: () => void) => { listeners.add(f); return () => listeners.delete(f); };
export const tables = { core: CORE, pending: PENDING };
