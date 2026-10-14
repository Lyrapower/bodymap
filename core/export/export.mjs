// BodyMap core — export module. Pure functions. No DOM, no network, no storage.
// Input: records (array matching schema/record.schema.json), locale 'zh'|'en', region 'CN'|'US'|'other'.
// Output: plain data the frontend renders (print view -> PDF). Nothing here interprets; it lists.

import descriptors from "../i18n/descriptors.json" with { type: "json" };
import socrates from "../i18n/socrates.json" with { type: "json" };
import ui from "../i18n/ui.json" with { type: "json" };
import departments from "../routing/departments.json" with { type: "json" };

const DESC = new Map();
for (const g of descriptors.groups) for (const it of g.items) DESC.set(it.id, it);
const DEPT = new Map(departments.departments.map((d) => [d.id, d]));

export const t = (key, locale) => (ui[key] ? ui[key][locale] ?? ui[key].en : key);
export const descLabel = (id, locale) => (DESC.get(id) ? DESC.get(id)[locale] : id);
export const deptLabel = (id, locale) => (DEPT.get(id) ? DEPT.get(id)[locale] : id);

const ms = (iso) => new Date(iso).getTime();
const byTime = (a, b) => ms(a.started_at) - ms(b.started_at);

/** Records that are not superseded by a later one. Old records are kept in storage; they are just not shown twice. */
export function effective(records) {
  const superseded = new Set(records.map((r) => r.supersedes).filter(Boolean));
  return records.filter((r) => !superseded.has(r.id)).sort(byTime);
}

export function latestVisit(records) {
  const v = effective(records).filter((r) => r.kind === "visit");
  return v.length ? v[v.length - 1] : null;
}

/** Duration in minutes, or null when the person did not say when it ended. Never guessed. */
export function durationMin(r) {
  if (!r.ended_at) return null;
  return Math.round((ms(r.ended_at) - ms(r.started_at)) / 60000);
}

function locationLabel(loc, locale, partLabels = {}) {
  const side = t(`side.${loc.side}`, locale);
  const part = partLabels[loc.part_id]?.[locale] ?? loc.part_id.replaceAll("_", " ");
  const depth = t(`depth.${loc.depth}`, locale);
  return locale === "zh" ? `${side}${part}（${depth}）` : `${side} ${part} (${depth})`;
}

/** Points for a timeline chart. One point per mark per record. No interpolation: the renderer draws dots, and gaps stay gaps. */
export function timelinePoints(records) {
  const out = [];
  for (const r of effective(records)) {
    if (r.kind !== "episode") continue;
    for (const m of r.marks ?? []) {
      out.push({ at: r.started_at, ended_at: r.ended_at ?? null, intensity: m.intensity, part_id: m.location.part_id, side: m.location.side, depth: m.location.depth, record_id: r.id });
    }
  }
  return out;
}

/** Mind series on the same timeline. Only records where the person filled something in. */
export function mindPoints(records) {
  return effective(records)
    .filter((r) => r.mind && (r.mind.stress != null || r.mind.mood != null || r.mind.sleep_hours != null))
    .map((r) => ({ at: r.started_at, stress: r.mind.stress ?? null, mood: r.mind.mood ?? null, sleep_hours: r.mind.sleep_hours ?? null }));
}

/** Gaps longer than `days` between consecutive episodes. Shown on the self view as "nothing recorded here". */
export function gaps(records, days = 7) {
  const eps = effective(records).filter((r) => r.kind === "episode");
  const out = [];
  for (let i = 1; i < eps.length; i++) {
    const d = (ms(eps[i].started_at) - ms(eps[i - 1].started_at)) / 86400000;
    if (d > days) out.push({ from: eps[i - 1].started_at, to: eps[i].started_at, days: Math.round(d) });
  }
  return out;
}

/** Everything already checked, newest first, de-duplicated by name (latest result wins). */
export function ruledOut(records) {
  const seen = new Map();
  for (const r of effective(records)) for (const tst of r.tests ?? []) seen.set(tst.name.toLowerCase(), { ...tst, record_at: r.started_at });
  return [...seen.values()].sort((a, b) => (b.date ?? b.record_at).localeCompare(a.date ?? a.record_at));
}

function summarize(eps, locale, partLabels) {
  const marks = eps.flatMap((r) => (r.marks ?? []).map((m) => ({ r, m })));
  const intensities = marks.map((x) => x.m.intensity);
  const durations = eps.map(durationMin).filter((d) => d != null);
  const partCount = new Map();
  for (const { m } of marks) {
    const k = `${m.location.side}|${m.location.part_id}|${m.location.depth}`;
    partCount.set(k, (partCount.get(k) ?? 0) + 1);
  }
  const sites = [...partCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const [side, part_id, depth] = k.split("|");
    return { side, part_id, depth, count: n, label: locationLabel({ side, part_id, depth }, locale, partLabels) };
  });
  const descCount = new Map();
  for (const { m } of marks) for (const d of m.descriptors ?? []) descCount.set(d, (descCount.get(d) ?? 0) + 1);
  const character = [...descCount.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, count: n, label: descLabel(id, locale) }));
  const radiating = marks.filter((x) => x.m.shape === "line" || x.m.shape === "radiating").map((x) => ({ from: locationLabel(x.m.location, locale, partLabels), to: x.m.to ? locationLabel(x.m.to, locale, partLabels) : null }));
  const collect = (key) => { const c = new Map(); for (const r of eps) for (const v of r.context?.[key] ?? []) c.set(v, (c.get(v) ?? 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ text: v, count: n })); };
  const onset = new Map(); for (const r of eps) if (r.context?.onset) onset.set(r.context.onset, (onset.get(r.context.onset) ?? 0) + 1);
  const pattern = new Map(); for (const r of eps) if (r.context?.pattern) pattern.set(r.context.pattern, (pattern.get(r.context.pattern) ?? 0) + 1);
  return {
    episodes: eps.length,
    first_at: eps[0]?.started_at ?? null,
    last_at: eps[eps.length - 1]?.started_at ?? null,
    intensity: intensities.length ? { min: Math.min(...intensities), max: Math.max(...intensities), values: intensities } : null,
    duration_min: durations.length ? { min: Math.min(...durations), max: Math.max(...durations), n: durations.length, unknown: eps.length - durations.length } : { n: 0, unknown: eps.length },
    sites, character, radiating,
    onset: [...onset.entries()].map(([k, n]) => ({ id: k, label: t(`onset.${k}`, locale), count: n })),
    pattern: [...pattern.entries()].map(([k, n]) => ({ id: k, label: t(`pattern.${k}`, locale), count: n })),
    triggers: collect("triggers"), relief: collect("relief"), associated: collect("associated"),
    activities: eps.map((r) => r.context?.activity).filter(Boolean),
  };
}

/**
 * Doctor view: organized by interval. Window = since the latest visit (or everything if none).
 * Sections follow SOCRATES order from i18n/socrates.json. Numbers are listed; nothing is averaged into a verdict.
 */
export function doctorView(records, { locale = "en", partLabels = {} } = {}) {
  const all = effective(records);
  const visit = latestVisit(all);
  let from = visit ? ms(visit.started_at) : -Infinity;
  let eps = all.filter((r) => r.kind === "episode" && ms(r.started_at) >= from);
  // A visit logged just now has nothing after it yet: fall back to everything, so the page is never empty by accident.
  let sinceVisit = Boolean(visit);
  if (visit && !eps.length) { from = -Infinity; sinceVisit = false; eps = all.filter((r) => r.kind === "episode"); }
  const s = summarize(eps, locale, partLabels);
  return {
    view: "doctor",
    locale,
    window: { since_visit: sinceVisit, from: sinceVisit ? visit.started_at : s.first_at, to: s.last_at, label: t(sinceVisit ? "export.since_visit" : "export.all", locale) },
    last_visit: visit ? { at: visit.started_at, department: deptLabel(visit.visit.department, locale), clinician: visit.visit.clinician ?? null, said: visit.visit.said ?? null, did: visit.visit.did ?? null, next: visit.visit.next ?? null } : null,
    sections: socrates.sections.map((sec) => ({ id: sec.id, heading: sec[locale] ?? sec.en })),
    summary: s,
    ruled_out: ruledOut(all),
    timeline: timelinePoints(eps),
    mind: mindPoints(eps),
    footer: [t("footer.record_only", locale)],
  };
}

/** Self view: continuous. Whole timeline, mind alongside, gaps shown, what passed. */
export function selfView(records, { locale = "en", partLabels = {} } = {}) {
  const all = effective(records);
  const eps = all.filter((r) => r.kind === "episode");
  const s = summarize(eps, locale, partLabels);
  return {
    view: "self",
    locale,
    summary: s,
    timeline: timelinePoints(eps),
    mind: mindPoints(all),
    gaps: gaps(all),
    passed: eps.filter((r) => r.ended_at).length,
    still: eps.filter((r) => !r.ended_at).length,
    visits: all.filter((r) => r.kind === "visit").map((v) => ({ at: v.started_at, department: deptLabel(v.visit.department, locale), said: v.visit.said ?? null, did: v.visit.did ?? null })),
    footer: [t("footer.record_only", locale), t("footer.emergency", locale)],
  };
}

/** Words that must never appear in any export. Test enforces it. */
export const FORBIDDEN = [/improv/i, /wors/i, /severe/i, /abnormal/i, /diagnos(?!is\.)/i, /好转/, /加重/, /恶化/, /严重/, /异常/, /诊断为/];
