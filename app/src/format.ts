// Date / duration formatting. Numbers and times only; no judgement words.
import { getLocale, t } from "./i18n";

const tag = () => (getLocale() === "zh" ? "zh-CN" : "en-US");
/** A date-only string ("2026-09-24", from a date field) is a calendar day, not UTC midnight. `new Date("2026-09-24")`
 * reads it as UTC, which shows as the day before anywhere west of UTC; read it as local midnight instead. */
export const parseWhen = (iso: string): Date => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(+m[1]!, +m[2]! - 1, +m[3]!) : new Date(iso);
};
/** "Left Deltoid" in English, "左三角肌" in Chinese: a side and a part name, spaced the way each language writes them. */
export const siteName = (side: string, part: string, l = getLocale()) => (l === "zh" ? `${t("side." + side, l)}${part}` : `${t("side." + side, l)} ${part}`);
export const fmtDateTime = (iso: string) => { const d = parseWhen(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d); };
export const fmtDate = (iso: string) => { const d = parseWhen(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { year: "numeric", month: "numeric", day: "numeric" }).format(d); };
export const fmtTime = (iso: string) => { const d = parseWhen(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { hour: "2-digit", minute: "2-digit", hour12: false }).format(d); };
export const fmtShortDate = (iso: string) => { const d = parseWhen(iso); return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat(tag(), { month: "numeric", day: "numeric" }).format(d); };

/** "25 min", "3.5 h", "2 days". Null when there is no end. */
export function fmtDuration(min: number | null): string | null {
  if (min == null || !Number.isFinite(min)) return null;
  if (min < 90) return `${Math.max(0, Math.round(min))} ${t("minutes")}`;
  if (min < 48 * 60) return `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)} ${t("hours")}`;
  return `${Math.round(min / 1440)} ${t("days")}`;
}
export const sep = () => (getLocale() === "zh" ? "、" : ", ");

/** " · 10/14/2026" when both ends fall on the same day, " · 10/1/2026 – 10/14/2026" otherwise. */
export function dateRange(from: string | null | undefined, to: string | null | undefined): string {
  const a = from ? fmtDate(from) : "", b = to ? fmtDate(to) : "";
  if (a && b) return a === b ? ` · ${a}` : ` · ${a} – ${b}`;
  return a ? ` · ${a}` : b ? ` – ${b}` : "";
}
