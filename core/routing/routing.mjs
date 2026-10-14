// BodyMap core — routing ("who to see"). A transparent lookup. Opened only when the person asks.
// Input: records, region 'CN'|'US'|'other', locale. Output: 2-3 entries with the basis for each, red flags last, never a disease name.

import rules from "./rules.json" with { type: "json" };
import regions from "./regions.json" with { type: "json" };
import { effective, ruledOut, durationMin, deptLabel, t } from "../export/export.mjs";

/** Longest matching key wins: "biceps_femoris" is a leg before it is a "biceps" arm. */
const REGION_KEYS = Object.entries(regions.part_prefixes).flatMap(([region, keys]) => keys.map((k) => [k, region])).sort((a, b) => b[0].length - a[0].length);
export function regionOf(part_id) {
  const p = String(part_id ?? "").toLowerCase();
  for (const [key, region] of REGION_KEYS) if (p.includes(key)) return region;
  return "other";
}

function facts(records) {
  const eps = effective(records).filter((r) => r.kind === "episode");
  const marks = eps.flatMap((r) => (r.marks ?? []).map((m) => ({ r, m })));
  const regionsHit = new Set(marks.map((x) => regionOf(x.m.location.part_id)));
  const depths = new Set(marks.map((x) => x.m.location.depth));
  const descs = new Set(marks.flatMap((x) => x.m.descriptors ?? []));
  const parts = new Set(marks.map((x) => `${x.m.location.side}|${x.m.location.part_id}`));
  const triggers = eps.flatMap((r) => r.context?.triggers ?? []).join(" ").toLowerCase();
  const onsets = new Set(eps.map((r) => r.context?.onset).filter(Boolean));
  const patterns = new Set(eps.map((r) => r.context?.pattern).filter(Boolean));
  const durations = eps.map(durationMin).filter((d) => d != null);
  const maxIntensity = Math.max(0, ...marks.map((x) => x.m.intensity));
  const spanDays = eps.length ? (new Date(eps[eps.length - 1].started_at) - new Date(eps[0].started_at)) / 86400000 : 0;
  const normalTests = ruledOut(records).filter((x) => x.result === "normal").map((x) => x.name.toLowerCase());
  const last = eps[eps.length - 1];
  return { eps, marks, regionsHit, depths, descs, parts, triggers, onsets, patterns, durations, maxIntensity, spanDays, normalTests, last };
}

function matches(when, f) {
  if (when.region && ![...f.regionsHit].some((r) => when.region.includes(r))) return false;
  if (when.depth && ![...f.depths].some((d) => when.depth.includes(d))) return false;
  if (when.any_descriptor && !when.any_descriptor.some((d) => f.descs.has(d))) return false;
  if (when.triggers_like && !when.triggers_like.some((w) => f.triggers.includes(w.toLowerCase()))) return false;
  if (when.onset && !f.onsets.has(when.onset)) return false;
  if (when.pattern && !f.patterns.has(when.pattern)) return false;
  if (when.min_intensity != null && f.maxIntensity < when.min_intensity) return false;
  if (when.min_records != null && f.eps.length < when.min_records) return false;
  if (when.distinct_parts_min != null && f.parts.size < when.distinct_parts_min) return false;
  if (when.span_days_min != null && f.spanDays < when.span_days_min) return false;
  if (when.typical_duration_min_max != null) {
    if (!f.durations.length) return false;
    const sorted = [...f.durations].sort((a, b) => a - b);
    if (sorted[Math.floor(sorted.length / 2)] > when.typical_duration_min_max) return false;
  }
  if (when.tests_normal_any && !when.tests_normal_any.some((n) => f.normalTests.some((tn) => tn.includes(n.toLowerCase())))) return false;
  if (when.one_sided_face_or_limb) {
    const sides = new Set(f.marks.map((x) => x.m.location.side));
    if (!(sides.size === 1 && !sides.has("midline"))) return false;
  }
  return true;
}

/** Red flags are evaluated on the most recent episode only: they are about now, not history. */
function redFlags(f, locale) {
  // Only an episode the person has not closed counts as "now". A past episode never raises a flag.
  if (!f.last || f.last.ended_at) return [];
  const one = facts([f.last]);
  return rules.red_flags.rules.filter((r) => matches(r.when, one)).map((r) => ({ id: r.id, text: r[locale] ?? r.en }));
}

export function route(records, { region = "other", locale = "en" } = {}) {
  const f = facts(records);
  if (!f.eps.length) return { entries: [], red_flags: [], notes: [], hint: t("routing.hint", locale) };
  const col = region === "CN" ? "CN" : "US";
  const hits = rules.rules.filter((r) => matches(r.when, f) && r.id !== "fallback");
  const chosen = (hits.length ? hits : [rules.rules.find((r) => r.id === "fallback")]).slice(0, 2);
  const entries = [];
  const seen = new Set();
  for (const r of chosen) {
    const depts = [...(r[col] ?? r.US)];
    if (r.escalate_if && matches(r.escalate_if, f)) depts.push(...r.escalate_if.add);
    for (const d of depts) {
      if (seen.has(d)) continue;
      seen.add(d);
      entries.push({ department: d, label: deptLabel(d, locale), basis: r[`basis_${locale}`] ?? r.basis_en, rule: r.id, note: r[`note_${locale}`] ?? null });
      if (entries.length >= 3) break;
    }
    if (entries.length >= 3) break;
  }
  const notes = [];
  if (col === "US") { notes.push(rules.us_notes[`referral_${locale}`]); notes.push(rules.us_notes[`ppo_${locale}`]); }
  else notes.push(rules.cn_notes[`same_trip_${locale}`]);
  notes.push(t("routing.bring", locale));
  return {
    hint: t("routing.hint", locale),
    entries,
    ruled_out: ruledOut(records).filter((x) => x.result === "normal").map((x) => x.name),
    red_flags: redFlags(f, locale),
    emergency: t("footer.emergency", locale),
    notes,
  };
}
