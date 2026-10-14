// Timeline: dots, not lines. Intensity on the y axis, one dot per mark per record; mind rows beneath;
// gaps of more than 7 days are shaded and labelled. Data comes from core/export (timelinePoints, mindPoints, gaps).
import { timelinePoints, mindPoints, gaps } from "../../../core/export/export.mjs";
import { t, getLocale } from "../i18n";
import { h, tx } from "../dom";
import { fmtShortDate } from "../format";
import type { Rec } from "../records";

const NS = "http://www.w3.org/2000/svg";
const s = (tag: string, attrs: Record<string, string | number>, ...kids: (Node | string)[]) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};
const DAY = 86400000;

export interface TimelineOpts { width: number; onPick?: (recordId: string) => void; compact?: boolean; print?: boolean }

export function buildTimeline(records: Rec[], opts: TimelineOpts): HTMLElement {
  const pts = timelinePoints(records) as { at: string; ended_at: string | null; intensity: number; part_id: string; side: string; depth: string; record_id: string }[];
  const mind = mindPoints(records) as { at: string; stress: number | null; mood: number | null; sleep_hours: number | null }[];
  const gp = gaps(records) as { from: string; to: string; days: number }[];
  const wrap = h("div", { class: "timeline" + (opts.print ? " print" : "") });
  if (!pts.length && !mind.length) { wrap.append(tx("timeline.empty", "p", { class: "muted center" })); return wrap; }

  const times = [...pts.map((p) => +new Date(p.at)), ...mind.map((m) => +new Date(m.at))];
  let t0 = Math.min(...times), t1 = Math.max(...times);
  const span = Math.max(t1 - t0, 7 * DAY);
  const mid = (t0 + t1) / 2; t0 = mid - span / 2 - span * 0.06; t1 = mid + span / 2 + span * 0.06;
  const days = (t1 - t0) / DAY;
  const W = Math.max(opts.width, Math.min(4000, days * (opts.compact ? 4 : 7)));
  const padL = 30, padR = 12, plotH = opts.compact ? 120 : 160, rowH = 26, rows = 3, axisH = 22;
  const H = plotH + rows * rowH + axisH + 12;
  const x = (iso: string) => padL + ((+new Date(iso) - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v: number) => 8 + (1 - v / 10) * (plotH - 16);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "tl", role: "img", "aria-label": t("timeline") });

  // gaps
  for (const g of gp) {
    const a = x(g.from), b = x(g.to);
    svg.append(s("rect", { x: a, y: 0, width: Math.max(1, b - a), height: plotH, class: "gap" }));
    if (b - a > 70) svg.append(s("text", { x: (a + b) / 2, y: plotH / 2, class: "gap-label", "text-anchor": "middle" }, `${t("timeline.gap")} · ${g.days} ${t("days")}`));
  }
  // intensity grid
  for (const v of [0, 5, 10]) {
    svg.append(s("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: "grid" }));
    svg.append(s("text", { x: padL - 6, y: y(v) + 4, class: "tick", "text-anchor": "end" }, String(v)));
  }
  // dots
  for (const p of pts) {
    const c = s("circle", { cx: x(p.at), cy: y(p.intensity), r: 3.5 + p.intensity * 0.35, class: "dot" + (p.ended_at ? "" : " open"), "data-record": p.record_id });
    c.append(s("title", {}, `${fmtShortDate(p.at)} · ${p.intensity}`));
    if (opts.onPick) c.addEventListener("click", () => opts.onPick!(p.record_id));
    svg.append(c);
  }
  // mind rows
  const rowsDef: { key: "stress" | "mood" | "sleep_hours"; label: string; max: number }[] = [
    { key: "stress", label: t("mind.stress"), max: 10 }, { key: "mood", label: t("mind.mood"), max: 10 }, { key: "sleep_hours", label: t("mind.sleep"), max: 14 }];
  rowsDef.forEach((row, i) => {
    const yy = plotH + 8 + i * rowH;
    svg.append(s("line", { x1: padL, x2: W - padR, y1: yy + rowH / 2, y2: yy + rowH / 2, class: "grid" }));
    svg.append(s("text", { x: padL - 6, y: yy + rowH / 2 + 4, class: "tick", "text-anchor": "end" }, row.label.slice(0, 2)));
    for (const m of mind) {
      const v = m[row.key]; if (v == null) continue;
      const r = 2.5 + (v / row.max) * 4;
      svg.append(s("circle", { cx: x(m.at), cy: yy + rowH / 2, r, class: "mind" }));
    }
  });
  // axis
  const pxPerDay = (W - padL - padR) / days;
  const step = [1, 2, 7, 14, 30, 90].find((d) => d * pxPerDay >= 46) ?? 365; // labels never collide
  const start = new Date(t0); start.setHours(0, 0, 0, 0);
  for (let d = +start; d <= t1; d += step * DAY) {
    const xx = x(new Date(d).toISOString()); if (xx < padL) continue;
    svg.append(s("line", { x1: xx, x2: xx, y1: plotH + rows * rowH + 10, y2: plotH + rows * rowH + 14, class: "grid" }));
    svg.append(s("text", { x: xx, y: H - 4, class: "tick", "text-anchor": "middle" }, fmtShortDate(new Date(d).toISOString())));
  }
  const scroller = h("div", { class: "tl-scroll" }, svg);
  wrap.append(scroller);
  if (!opts.print) requestAnimationFrame(() => (scroller.scrollLeft = scroller.scrollWidth));
  void getLocale;
  return wrap;
}
