// Forms: episode details, mark details, visit + tests. Each saves as a new version (append-only).
import descriptors from "../../../core/i18n/descriptors.json";
import departments from "../../../core/routing/departments.json";
import { t, getLocale } from "../i18n";
import { h, tx, btn, chip, chipText, setPressed, slider, textField, listField, refreshText } from "../dom";
import { fromInputDT, toInputDT, clean, type Rec, type Mark, type Context, type Mind, type Visit, type Test, type Onset, type Pattern, type TestResult } from "../records";
import { state } from "../state";
import { openSheet, closeSheet, toast } from "./sheet";

const L = () => getLocale();
const DESC = descriptors as { groups: { id: string; zh: string; en: string; items: { id: string; zh: string; en: string }[] }[] };
const DEPTS = (departments as { departments: { id: string; zh: string; en: string }[] }).departments;
export const deptLabel = (id: string) => DEPTS.find((d) => d.id === id)?.[L()] ?? id;
export const descLabel = (id: string) => { for (const g of DESC.groups) for (const it of g.items) if (it.id === id) return it[L()]; return id; };

function dtField(key: string, value: string | null, onChange: (iso: string | null) => void, allowEmpty = false) {
  const input = h("input", { type: "datetime-local", class: "field", "aria-label": t(key), "data-t-aria": key }) as HTMLInputElement;
  input.value = value ? toInputDT(value) : "";
  input.addEventListener("change", () => { const v = fromInputDT(input.value); if (v || allowEmpty) onChange(v); });
  return h("label", { class: "fieldrow" }, tx(key, "span", { class: "label" }), input);
}
function dateField(key: string, value: string | null, onChange: (v: string | null) => void) {
  const input = h("input", { type: "date", class: "field", "aria-label": t(key), "data-t-aria": key }) as HTMLInputElement;
  input.value = value ?? "";
  input.addEventListener("change", () => onChange(input.value || null));
  return h("label", { class: "fieldrow" }, tx(key, "span", { class: "label" }), input);
}
function radioRow<T extends string>(key: string, options: T[], prefix: string, value: T | undefined, onChange: (v: T | undefined) => void) {
  const row = h("div", { class: "chips", role: "radiogroup" });
  const bs = options.map((o) => chip(`${prefix}.${o}`, value === o, (b) => {
    const on = b.getAttribute("aria-pressed") !== "true";
    bs.forEach((x) => setPressed(x, false)); if (on) setPressed(b, true);
    onChange(on ? o : undefined);
  }, "radio"));
  row.append(...bs);
  return h("div", { class: "fieldrow" }, tx(key, "span", { class: "label" }), row);
}

/** Episode details: times, context, mind. Saves on "Save"; a note under the button says a new version is written. */
export function openEpisodeDetails(r: Rec) {
  const ctx: Context = { ...(r.context ?? {}) };
  const mind: Mind = { ...(r.mind ?? {}) };
  let started = r.started_at, ended: string | null = r.ended_at ?? null;
  const body = h("div", { class: "form" },
    h("section", {},
      dtField("started", started, (v) => { if (v) started = v; }),
      dtField("ended", ended, (v) => (ended = v), true),
      h("p", { class: "muted" }, tx("still", "span"), " = ", tx("export.unknown_end", "span"))),
    h("section", {},
      textField("context.activity", ctx.activity ?? "", (v) => (ctx.activity = v)),
      radioRow<Onset>("context.onset", ["sudden", "gradual", "unknown"], "onset", ctx.onset, (v) => (ctx.onset = v)),
      listField("context.triggers", ctx.triggers ?? [], (v) => (ctx.triggers = v)),
      listField("context.relief", ctx.relief ?? [], (v) => (ctx.relief = v)),
      listField("context.associated", ctx.associated ?? [], (v) => (ctx.associated = v)),
      radioRow<Pattern>("context.pattern", ["constant", "comes_and_goes", "once"], "pattern", ctx.pattern, (v) => (ctx.pattern = v))),
    h("section", {},
      tx("mind", "h3"),
      slider({ labelKey: "mind.stress", min: 0, max: 10, value: mind.stress ?? null, ends: true, onInput: (v) => (mind.stress = v) }),
      slider({ labelKey: "mind.mood", min: 0, max: 10, value: mind.mood ?? null, ends: true, onInput: (v) => (mind.mood = v) }),
      slider({ labelKey: "mind.sleep", min: 0, max: 14, step: 0.5, value: mind.sleep_hours ?? null, onInput: (v) => (mind.sleep_hours = v) }),
      textField("mind.note", mind.note ?? "", (v) => (mind.note = v), true)),
    h("section", { class: "actions" },
      btn("save", async () => {
        await state.update(state.latest(r), clean({ started_at: started, ended_at: ended, context: ctx, mind }));
        toast(t("saved")); closeSheet(sheet);
      }, "btn primary"),
      tx("save.note", "p", { class: "muted" })));
  const sheet = openSheet("details", body);
}

/** Mark details: descriptors (grouped), note, extent, where it goes. Edits one mark of a record. */
export function openMarkDetails(r: Rec, index: number, onWantTo?: () => void) {
  const marks = (r.marks ?? []).map((m) => ({ ...m }));
  const m = marks[index]; if (!m) return;
  const selected = new Set(m.descriptors ?? []);
  const groups = DESC.groups.map((g) => h("div", { class: "group" },
    h("span", { class: "label" }, g[L()]),
    h("div", { class: "chips" }, ...g.items.map((it) => chipText(it[L()], selected.has(it.id), (b) => {
      if (selected.has(it.id)) { selected.delete(it.id); setPressed(b, false); }
      else if (selected.size < 6) { selected.add(it.id); setPressed(b, true); }
    })))));
  const extent = (m.shape === "patch" || m.shape === "radiating") ? slider({ labelKey: "radius", min: 0.05, max: 1, step: 0.05, value: m.radius ?? 0.3, onInput: (v) => (m.radius = v ?? 0.3) }) : null;
  const toRow = (m.shape === "line" || m.shape === "radiating") ? h("div", { class: "fieldrow" }, tx("mark.to", "span", { class: "label" }),
    m.to ? h("span", {}, `${t("side." + m.to.side)} ${m.to.part_id.replaceAll("_", " ")}`) : btn("mark.to_hint", () => { closeSheet(sheet); onWantTo?.(); }, "btn small")) : null;
  const body = h("div", { class: "form" },
    h("section", {}, tx("feels_like", "h3"), ...groups),
    h("section", {}, textField("note", m.note ?? "", (v) => (m.note = v), true, "note_hint"), extent, toRow),
    h("section", { class: "actions" },
      btn("save", async () => {
        m.descriptors = [...selected];
        marks[index] = clean(m);
        await state.setMarks(state.latest(r), marks);
        toast(t("saved")); closeSheet(sheet);
      }, "btn primary"),
      btn("mark.remove", async () => { marks.splice(index, 1); await state.setMarks(state.latest(r), marks); closeSheet(sheet); }, "btn quiet")));
  const sheet = openSheet("marks", body);
}

/** Visit: department, clinician, what they said / did, follow-up, tests done. New visit or edit. */
export function openVisitForm(existing?: Rec) {
  const v: Visit = { department: "", ...(existing?.visit ?? {}) };
  const tests: Test[] = (existing?.tests ?? []).map((x) => ({ ...x }));
  let started = existing?.started_at ?? null;
  const deptRow = h("div", { class: "chips" });
  const paintDepts = () => deptRow.replaceChildren(...DEPTS.map((d) => chipText(d[L()], v.department === d.id, () => { v.department = d.id; paintDepts(); })));
  paintDepts();
  const testsBox = h("div", { class: "tests" });
  const paintTests = () => testsBox.replaceChildren(...tests.map((tt, i) => h("div", { class: "test" },
    h("input", { type: "text", class: "field", value: tt.name, "aria-label": t("tests.name"), "data-t-aria": "tests.name", maxlength: "100" }),
    h("div", { class: "chips" }, ...(["normal", "abnormal", "pending", "unknown"] as TestResult[]).map((res) => chip("result." + (res === "abnormal" ? "finding" : res), tt.result === res, () => { tt.result = res; paintTests(); }, "radio"))),
    h("input", { type: "date", class: "field", value: tt.date ?? "", "aria-label": t("date"), "data-t-aria": "date" }),
    btn("mark.remove", () => { tests.splice(i, 1); paintTests(); }, "btn quiet small"))));
  testsBox.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement; const row = el.closest(".test"); if (!row) return;
    const i = [...testsBox.children].indexOf(row);
    if (el.type === "text") tests[i].name = el.value; else if (el.type === "date") tests[i].date = el.value || null;
  });
  paintTests();
  const body = h("div", { class: "form" },
    h("section", {},
      dtField("date", started ?? new Date().toISOString(), (x) => (started = x)),
      h("div", { class: "fieldrow" }, tx("visit.department", "span", { class: "label" }), deptRow),
      textField("visit.clinician", v.clinician ?? "", (x) => (v.clinician = x)),
      textField("visit.said", v.said ?? "", (x) => (v.said = x), true),
      textField("visit.did", v.did ?? "", (x) => (v.did = x), true),
      dateField("visit.next", v.next ?? null, (x) => (v.next = x))),
    h("section", {}, tx("tests", "h3"), testsBox, btn("tests.add", () => { tests.push({ name: "", result: "unknown", date: null }); paintTests(); refreshText(testsBox); }, "btn small")),
    h("section", { class: "actions" },
      btn("save", async () => {
        if (!v.department) { toast(t("visit.department")); return; }
        const patch = clean({ started_at: started ?? undefined, visit: v, tests: tests.filter((x) => x.name.trim()) });
        if (existing) await state.update(state.latest(existing), patch);
        else await state.add("visit", { ...patch, ended_at: undefined });
        toast(t("saved")); closeSheet(sheet);
      }, "btn primary"),
      tx("save.note", "p", { class: "muted" })));
  const sheet = openSheet("visit", body);
}

export function markSummary(m: Mark, partLabel: (id: string) => string) {
  const l = m.location;
  return `${t("side." + l.side)} ${partLabel(l.part_id)} · ${t("depth." + l.depth)} · ${t("shape." + m.shape)} · ${m.intensity}`;
}
