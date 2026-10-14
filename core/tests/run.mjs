// Core tests. Plain node, no dependencies. `node tests/run.mjs` exits 0 or 1.
import { readFileSync } from "node:fs";
import { effective, doctorView, selfView, timelinePoints, gaps, ruledOut, durationMin, FORBIDDEN } from "../export/export.mjs";
import { route, regionOf } from "../routing/routing.mjs";

const records = JSON.parse(readFileSync(new URL("../fixtures/sample_records.json", import.meta.url)));
const schema = JSON.parse(readFileSync(new URL("../schema/record.schema.json", import.meta.url)));
let fails = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "ok " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); if (!cond) fails++; };

// 1. Fixtures satisfy the schema's required fields and enums (lightweight check, no ajv).
for (const r of records) {
  ok(`required fields ${r.id}`, schema.required.every((k) => k in r));
  ok(`kind enum ${r.id}`, schema.properties.kind.enum.includes(r.kind));
  for (const m of r.marks ?? []) {
    ok(`mark intensity int 0..10 ${r.id}`, Number.isInteger(m.intensity) && m.intensity >= 0 && m.intensity <= 10);
    ok(`local 0..1 ${r.id}`, m.location.local.every((v) => v >= 0 && v <= 1));
    ok(`depth enum ${r.id}`, ["skin", "muscle", "bone", "deep"].includes(m.location.depth));
  }
}

// 2. supersedes: the corrected record replaces the old one in views, the old one is not deleted from input.
const eff = effective(records);
ok("superseded record hidden", !eff.some((r) => r.id === "a1b2c3d4-0005"));
ok("correcting record shown", eff.some((r) => r.id === "a1b2c3d4-0006"));
ok("input untouched", records.length === 6);

// 3. Duration is never guessed.
ok("open episode duration null", durationMin(records[4]) === null);
ok("closed episode duration 25", durationMin(records[0]) === 25);

// 4. Doctor view windows from the last visit; sections follow SOCRATES; ruled-out lists the ECG.
const dv = doctorView(records, { locale: "zh" });
ok("doctor window since visit", dv.window.since_visit === true && dv.window.from === "2026-09-03T14:00:00-07:00");
ok("doctor episodes after visit = 3", dv.summary.episodes === 3);
ok("SOCRATES has 10 sections", dv.sections.length === 10 && dv.sections[0].heading === "部位");
ok("ruled out has ECG normal", dv.ruled_out.some((x) => x.name === "ECG" && x.result === "normal"));
ok("intensity listed not averaged", Array.isArray(dv.summary.intensity.values) && !("mean" in dv.summary.intensity));

// 4b. A visit with nothing after it: the doctor view falls back to all episodes instead of an empty page.
{
  const justVisited = [...records, { schema_version: "1.0", id: "visit-now-0001", kind: "visit", created_at: "2026-12-01T10:00:00-07:00", started_at: "2026-12-01T10:00:00-07:00", visit: { department: "general" } }];
  const dv2 = doctorView(justVisited, { locale: "en" });
  ok("doctor view falls back to all when nothing follows the latest visit", dv2.window.since_visit === false && dv2.summary.episodes === 4 && dv2.last_visit.at === "2026-12-01T10:00:00-07:00");
}

// 5. Self view: whole timeline, gaps, mind alongside.
const sv = selfView(records, { locale: "en" });
ok("self episodes = 4", sv.summary.episodes === 4);
ok("gaps > 7 days detected (8 and 14)", gaps(records).map((g) => g.days).join(",") === "8,14", JSON.stringify(gaps(records)));
ok("mind points present", sv.mind.length === 3);
ok("passed/still counts", sv.passed === 4 && sv.still === 0);

// 6. Timeline points are dots, no fabricated fields.
const pts = timelinePoints(records);
ok("timeline points = 4 marks", pts.length === 4 && pts.every((p) => "at" in p && "intensity" in p && !("interpolated" in p)));

// 7. No verdict words anywhere in either export.
for (const [name, v] of [["doctor zh", dv], ["doctor en", doctorView(records, { locale: "en" })], ["self zh", selfView(records, { locale: "zh" })], ["self en", sv]]) {
  const s = JSON.stringify(v);
  ok(`no verdict words in ${name}`, !FORBIDDEN.some((re) => re.test(s)), FORBIDDEN.filter((re) => re.test(s)).map(String).join(","));
}

// 8. Routing: region mapping; chest + cardiac tests normal + recurring -> mental health appears, not another cardiology-first.
ok("regionOf vastus -> leg", regionOf("vastus_lateralis") === "leg");
ok("regionOf pectoralis -> chest", regionOf("pectoralis_major") === "chest");
const rCN = route(records, { region: "CN", locale: "zh" });
ok("routing CN gives 2-3 entries", rCN.entries.length >= 2 && rCN.entries.length <= 3);
ok("routing CN includes mental_health after normal ECG", rCN.entries.some((e) => e.department === "mental_health"), JSON.stringify(rCN.entries.map((e) => e.department)));
ok("routing lists ruled out", rCN.ruled_out.includes("ECG"));
ok("routing has emergency line", typeof rCN.emergency === "string" && rCN.emergency.length > 0);
const rUS = route(records, { region: "US", locale: "en" });
ok("routing US starts with primary care", rUS.entries[0].department === "general", JSON.stringify(rUS.entries.map((e) => e.department)));
ok("routing US has referral notes", rUS.notes.length >= 3);
// red flags only for an episode still open: the latest one has ended -> no flag even though it has chest + sweating
ok("no red flag on a closed episode", rUS.red_flags.length === 0, JSON.stringify(rUS.red_flags));
// execution case: a current chest episode with short_breath must raise the red flag
const hot = [...records, { schema_version: "1.0", id: "zz-hot", kind: "episode", created_at: "2026-10-01T10:00:00-07:00", started_at: "2026-10-01T09:50:00-07:00", ended_at: null, marks: [{ location: { part_id: "sternum", side: "midline", local: [0.5, 0.5, 0.9], depth: "deep" }, shape: "patch", intensity: 8, descriptors: ["crushing", "short_breath"] }] }];
ok("red flag raised for current chest + short_breath", route(hot, { region: "US", locale: "en" }).red_flags.some((f) => f.id === "chest_breath"));
// empty input
ok("routing empty input -> no entries", route([], { region: "CN", locale: "zh" }).entries.length === 0);
ok("doctor view empty input ok", doctorView([], { locale: "en" }).summary.episodes === 0);

// 9. i18n: every ui key has zh and en; descriptors ids unique.
const ui = JSON.parse(readFileSync(new URL("../i18n/ui.json", import.meta.url)));
ok("ui strings bilingual", Object.entries(ui).filter(([k]) => !k.startsWith("_")).every(([, v]) => v.zh && v.en));
const desc = JSON.parse(readFileSync(new URL("../i18n/descriptors.json", import.meta.url)));
const ids = desc.groups.flatMap((g) => g.items.map((i) => i.id));
ok("descriptor ids unique", new Set(ids).size === ids.length);
ok("no warning words in ui", !FORBIDDEN.some((re) => re.test(JSON.stringify(Object.fromEntries(Object.entries(ui).filter(([k]) => !k.startsWith("_")))))));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
