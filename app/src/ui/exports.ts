// Export views (print -> PDF), "who to see", backup, settings / about. All content comes from core's pure functions.
import { doctorView, selfView } from "../../../core/export/export.mjs";
import { route } from "../../../core/routing/routing.mjs";
import { t, getLocale, setLocale, type Locale } from "../i18n";
import { h, tx, btn, chip, setPressed, refreshText } from "../dom";
import { fmtDate, fmtDateTime, fmtDuration, sep, dateRange } from "../format";
import { isoLocal, type Rec, type Mark } from "../records";
import { state, type Region } from "../state";
import { parseBackup, type Backup } from "../store/db";
import { buildTimeline } from "./timeline";
import { openSheet, toast } from "./sheet";

export interface ExportHooks { partLabels: Record<string, { zh: string; en: string }>; snapshot: (marks: Mark[], azimuth: number) => string | null; modelVersion: () => string; version: string }

type Count = { label?: string; text?: string; count: number };
const countList = (xs: Count[]) => xs.map((x) => `${x.label ?? x.text} ×${x.count}`).join(sep());

/** Marks for the figures: same spot drawn once (strongest intensity wins), capped so a long history still renders in time. */
function figureMarks(records: Rec[], cap = 400): Mark[] {
  const seen = new Map<string, Mark>();
  for (const r of records) for (const m of r.marks ?? []) {
    const l = m.location, key = `${l.part_id}|${l.side}|${l.local.map((v) => v.toFixed(2)).join(",")}`;
    const prev = seen.get(key);
    if (!prev || prev.intensity < m.intensity) seen.set(key, m);
  }
  return [...seen.values()].slice(-cap);
}
function bodyFigures(records: Rec[], hooks: ExportHooks) {
  const marks = figureMarks(records);
  const front = hooks.snapshot(marks, 0), back = hooks.snapshot(marks, Math.PI);
  if (!front || !back) return null;
  return h("div", { class: "figures" }, h("img", { src: front, alt: t("view.full") }), h("img", { src: back, alt: t("view.full") }));
}

export function openDoctorExport(hooks: ExportHooks) {
  const recs = state.effective;
  const d = doctorView(recs, { locale: getLocale(), partLabels: hooks.partLabels });
  const S = d.summary;
  const sec = (id: string, ...kids: (Node | string | null)[]) => h("section", { class: "sec", "data-sec": id }, h("h3", {}, d.sections.find((x: { id: string }) => x.id === id)?.heading ?? id), ...kids.filter(Boolean) as (Node | string)[]);
  const p = (txt: string | null | undefined) => (txt ? h("p", {}, txt) : null);
  const windowRecs = recs.filter((r) => r.kind === "episode" && (!d.window.from || r.started_at >= d.window.from));
  const doc = h("article", { class: "print-doc", lang: getLocale() === "zh" ? "zh-CN" : "en" },
    h("header", {}, tx("export.doctor", "h2"), h("p", { class: "muted" }, `${d.window.label}${dateRange(d.window.from, d.window.to)} · ${S.episodes} ${t("export.episodes")} · ${t("export.generated")} ${fmtDateTime(isoLocal())}`)),
    bodyFigures(windowRecs, hooks),
    sec("S", S.sites.length ? h("ul", {}, ...S.sites.map((x: { label: string; count: number }) => h("li", {}, `${x.label} ×${x.count}`))) : p(t("not_recorded"))),
    sec("O", p(S.first_at ? `${t("started")} ${fmtDateTime(S.first_at)}` : null), p(S.onset.length ? countList(S.onset) : null)),
    sec("C", p(S.character.length ? countList(S.character) : t("not_recorded"))),
    sec("R", S.radiating.length ? h("ul", {}, ...S.radiating.map((x: { from: string; to: string | null }) => h("li", {}, x.to ? `${x.from} → ${x.to}` : x.from))) : p(t("not_recorded"))),
    sec("A", p(S.associated.length ? countList(S.associated) : t("not_recorded")), mindLine(d.mind)),
    sec("T", p(`${S.episodes} ${t("export.episodes")}${S.first_at ? " · " + fmtDate(S.first_at) : ""}${S.last_at ? " – " + fmtDate(S.last_at) : ""}`),
      p(S.pattern.length ? countList(S.pattern) : null),
      p(S.duration_min.n ? `${fmtDuration(S.duration_min.min ?? null)} – ${fmtDuration(S.duration_min.max ?? null)} (n=${S.duration_min.n})${S.duration_min.unknown ? ` · ${S.duration_min.unknown} ${t("export.unknown_end")}` : ""}` : S.duration_min.unknown ? `${S.duration_min.unknown} ${t("export.unknown_end")}` : null)),
    sec("E", p(S.triggers.length ? `${t("context.triggers")}: ${countList(S.triggers)}` : null), p(S.relief.length ? `${t("context.relief")}: ${countList(S.relief)}` : null), !S.triggers.length && !S.relief.length ? p(t("not_recorded")) : null),
    sec("S2", p(S.intensity ? `${S.intensity.min} – ${S.intensity.max} · ${S.intensity.values.join(" ")}` : t("not_recorded"))),
    sec("X", d.ruled_out.length ? h("table", {}, h("tbody", {}, ...d.ruled_out.map((x: { name: string; result: string; date: string | null; record_at: string }) => h("tr", {}, h("td", {}, x.name), h("td", {}, t("result." + (x.result === "abnormal" ? "finding" : x.result))), h("td", {}, fmtDate(x.date ?? x.record_at)))))) : p(t("not_recorded"))),
    sec("V", d.last_visit ? h("div", {}, p(`${fmtDate(d.last_visit.at)} · ${d.last_visit.department}${d.last_visit.clinician ? " · " + d.last_visit.clinician : ""}`), p(d.last_visit.said), p(d.last_visit.did), p(d.last_visit.next ? `${t("visit.next")} ${d.last_visit.next}` : null)) : p(t("not_recorded"))),
    h("footer", {}, ...d.footer.map((f: string) => h("p", {}, f))));
  openPrintSheet("export.doctor", doc);
}

function mindLine(mind: { stress: number | null; mood: number | null; sleep_hours: number | null }[]) {
  if (!mind.length) return null;
  const col = (k: "stress" | "mood" | "sleep_hours", key: string) => { const v = mind.map((m) => m[k]).filter((x): x is number => x != null); return v.length ? `${t(key)} ${Math.min(...v)} – ${Math.max(...v)}` : null; };
  const parts = [col("stress", "mind.stress"), col("mood", "mind.mood"), col("sleep_hours", "mind.sleep")].filter(Boolean);
  return parts.length ? h("p", {}, parts.join(" · ")) : null;
}

export function openSelfExport(hooks: ExportHooks) {
  const recs = state.effective;
  const sv = selfView(recs, { locale: getLocale(), partLabels: hooks.partLabels });
  const doc = h("article", { class: "print-doc", lang: getLocale() === "zh" ? "zh-CN" : "en" },
    h("header", {}, tx("export.self", "h2"), h("p", { class: "muted" }, `${sv.summary.episodes} ${t("export.episodes")} · ${t("export.passed")} ${sv.passed} · ${t("export.still")} ${sv.still} · ${t("export.generated")} ${fmtDateTime(isoLocal())}`)),
    buildTimeline(recs, { width: 640, print: true }),
    bodyFigures(recs.filter((r) => r.kind === "episode"), hooks),
    h("section", { class: "sec" }, tx("export.sites", "h3"), sv.summary.sites.length ? h("ul", {}, ...sv.summary.sites.map((x: { label: string; count: number }) => h("li", {}, `${x.label} ×${x.count}`))) : h("p", {}, t("not_recorded"))),
    sv.gaps.length ? h("section", { class: "sec" }, tx("timeline.gap", "h3"), h("ul", {}, ...sv.gaps.map((g: { from: string; to: string; days: number }) => h("li", {}, `${fmtDate(g.from)} – ${fmtDate(g.to)} · ${g.days} ${t("days")}`)))) : null,
    h("section", { class: "sec" }, tx("export.visits", "h3"), sv.visits.length ? h("ul", {}, ...sv.visits.map((v: { at: string; department: string; said: string | null }) => h("li", {}, `${fmtDate(v.at)} · ${v.department}${v.said ? " · " + v.said : ""}`))) : h("p", {}, t("not_recorded"))),
    h("footer", {}, ...sv.footer.map((f: string) => h("p", {}, f))));
  openPrintSheet("export.self", doc);
}

function openPrintSheet(titleKey: string, doc: HTMLElement) {
  const print = btn("print", () => {
    const root = h("div", { id: "print-root" }, doc.cloneNode(true));
    document.body.append(root); document.documentElement.classList.add("printing");
    const done = () => { root.remove(); document.documentElement.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 60000);
  }, "btn primary");
  openSheet(titleKey, h("div", { class: "form" }, h("section", { class: "actions" }, print), doc), { cls: "wide" });
}

export function openRouting() {
  const recs = state.effective;
  const r = route(recs, { region: state.region, locale: getLocale() });
  const body = h("div", { class: "form" });
  body.append(h("p", { class: "muted" }, r.hint));
  if (!r.entries.length) { body.append(tx("routing.empty", "p", { class: "muted" })); openSheet("routing", body); return; }
  if (r.red_flags.length) body.append(h("section", { class: "flag" }, h("p", {}, r.emergency), h("ul", {}, ...r.red_flags.map((f: { text: string }) => h("li", {}, f.text)))));
  body.append(h("section", {}, ...r.entries.map((e: { label: string; basis: string; note: string | null }) => h("div", { class: "entry" }, h("strong", {}, e.label), h("div", { class: "muted" }, `${t("routing.basis")}: ${e.basis}`), e.note ? h("div", { class: "muted" }, e.note) : ""))));
  if (r.ruled_out?.length) body.append(h("section", {}, tx("routing.ruled_out", "h3"), h("p", {}, r.ruled_out.join(sep()))));
  body.append(h("section", {}, ...r.notes.map((n: string) => h("p", { class: "muted" }, n))));
  openSheet("routing", body);
}

export function openMore(hooks: ExportHooks) {
  const regionRow = h("div", { class: "chips", role: "radiogroup" });
  const rb = (["CN", "US", "other"] as Region[]).map((rg) => chip("region." + rg, state.region === rg, (b) => { rb.forEach((x) => setPressed(x, false)); setPressed(b, true); state.setRegion(rg); }, "radio"));
  regionRow.append(...rb);
  const langRow = h("div", { class: "chips", role: "radiogroup" });
  const lb = (["zh", "en"] as Locale[]).map((l) => chip("lang." + l, getLocale() === l, (b) => { lb.forEach((x) => setPressed(x, false)); setPressed(b, true); setLocale(l); }, "radio"));
  langRow.append(...lb);
  const file = h("input", { type: "file", accept: "application/json,.json", class: "hidden-file", "aria-label": t("import.backup"), "data-t-aria": "import.backup" }) as HTMLInputElement;
  file.addEventListener("change", async () => {
    const f = file.files?.[0]; if (!f) return;
    const b = parseBackup(await f.text());
    if (!b) { toast(t("backup.bad")); file.value = ""; return; }
    const { added, skipped } = await state.importRecords(b.records);
    toast(`${t("backup.imported")} ${added}${skipped ? ` · ${skipped} ${t("backup.skipped")}` : ""}`);
    file.value = "";
  });
  const body = h("div", { class: "form more" },
    h("section", {}, tx("export", "h3"),
      h("div", { class: "stack" }, btn("export.doctor", () => openDoctorExport(hooks)), btn("export.self", () => openSelfExport(hooks)))),
    h("section", {}, tx("routing", "h3"), h("div", { class: "stack" }, btn("routing.open", openRouting))),
    h("section", {}, tx("export.backup", "h3"),
      h("div", { class: "stack" }, btn("export.backup", () => exportBackup(hooks)), btn("import.backup", () => file.click()), file),
      tx("backup.note", "p", { class: "muted" })),
    h("section", {}, tx("settings", "h3"),
      h("div", { class: "fieldrow" }, tx("settings.language", "span", { class: "label" }), langRow),
      h("div", { class: "fieldrow" }, tx("settings.region", "span", { class: "label" }), regionRow)),
    h("section", {}, tx("about", "h3"),
      h("div", { class: "kv" }, tx("version", "span", { class: "k" }), h("span", { class: "v" }, hooks.version)),
      h("div", { class: "kv" }, tx("model", "span", { class: "k" }), h("span", { class: "v" }, hooks.modelVersion())),
      h("div", { class: "kv" }, tx("records_count", "span", { class: "k" }), h("span", { class: "v" }, String(state.effective.length))),
      tx("license", "p", { class: "muted" }), tx("built_with", "p", { class: "muted" })));
  openSheet("tab.more", body);
  refreshText(body);
}

export function exportBackup(hooks: ExportHooks) {
  const b: Backup = { format: "bodymap-backup", schema_version: "1.0", exported_at: isoLocal(), app_version: hooks.version, locale: getLocale(), region: state.region, records: state.all };
  const blob = new Blob([JSON.stringify(b, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `bodymap-backup-${isoLocal().slice(0, 10)}.json` }) as HTMLAnchorElement;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast(t("backup.exported"));
}
