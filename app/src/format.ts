// Date / duration formatting. Numbers and times only; no judgement words.
import { getLocale, t } from "./i18n";

const tag = () => (getLocale() === "zh" ? "zh-CN" : "en-US");
export const fmtDateTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d); };
export const fmtDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { year: "numeric", month: "numeric", day: "numeric" }).format(d); };
export const fmtTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { hour: "2-digit", minute: "2-digit", hour12: false }).format(d); };
export const fmtShortDate = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { month: "numeric", day: "numeric" }).format(d); };

/** "25 min", "3.5 h", "2 days". Null when there is no end. */
export function fmtDuration(min: number | null): string | null {
  if (min == null || !Number.isFinite(min)) return null;
  if (min < 90) return `${Math.max(0, Math.round(min))} ${t("minutes")}`;
  if (min < 48 * 60) return `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)} ${t("hours")}`;
  return `${Math.round(min / 1440)} ${t("days")}`;
}
export const sep = () => (getLocale() === "zh" ? "、" : ", ");
