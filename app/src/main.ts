import "./style.css";
import { Vector3 } from "three";
import { durationMin } from "../../core/export/export.mjs";
import { t, getLocale, setLocale, onLocale, type Locale } from "./i18n";
import { loadBody } from "./body/model";
import type { Depth } from "./body/naming";
import { Viewer, type Pick, type ViewPreset } from "./viewer/viewer";
import { MODEL } from "./config";
import { $, h, tx, btn, chip, setPressed, slider, refreshText, isOn } from "./dom";
import { fmtTime, fmtDuration } from "./format";
import { isoLocal, clean, type Rec, type Mark, type Shape } from "./records";
import { state } from "./state";
import { openSheet, closeAllSheets, sheetsOpen, toast } from "./ui/sheet";
import { openEpisodeDetails, openMarkDetails, openVisitForm } from "./ui/forms";
import { buildTimeline } from "./ui/timeline";
import { buildHistory, openDetail } from "./ui/history";
import { openMore } from "./ui/exports";

const APP_VERSION = "0.2.0";

// ---------- layout ----------
const app = $("#app");
const canvas = h("canvas", { id: "scene", "data-t-aria": "mark.tap_hint", role: "img" }) as HTMLCanvasElement;
const langBtn = h("button", { class: "lang", type: "button" });
const header = h("header", { class: "top" },
  h("div", { class: "brand" }, tx("app", "h1"), tx("tagline", "p")),
  langBtn);
const status = h("div", { class: "status", role: "status" }, tx("model.loading"));
const hint = h("div", { class: "hint", "aria-hidden": "true" }, tx("mark.tap_hint"));
const readout = h("div", { class: "readout", hidden: "" });
const shapeRow = h("div", { class: "row shape-row", hidden: "" });
const recordRow = h("div", { class: "record-row" });
const layerRow = h("div", { class: "chips", role: "group" });
const viewRow = h("div", { class: "chips", role: "radiogroup" });
const motion = h("input", { type: "checkbox", id: "reduced" }) as HTMLInputElement;
const motionSwitch = h("label", { class: "switch", for: "reduced" }, motion, h("span", { class: "knob", "aria-hidden": "true" }), tx("settings.reduced_motion"));
const tabs = h("nav", { class: "tabs", role: "tablist" });
const panel = h("section", { class: "panel" },
  readout, shapeRow, recordRow,
  h("div", { class: "row layer-row" }, tx("layer", "span", { class: "label" }), layerRow, motionSwitch));
const viewDock = h("div", { class: "view-dock" }, viewRow);
const footer = h("footer", { class: "foot-note" }, tx("footer.record_only", "p"), tx("footer.emergency", "p"), tx("built_with", "p", { class: "built" }));
const placeholderTag = h("span", { class: "tag", hidden: "" }, tx("model.placeholder"));
header.querySelector(".brand")!.append(placeholderTag);
const dock = h("div", { class: "dock" }, hint, panel, footer, tabs);
app.append(canvas, header, status, viewDock, dock);

const viewer = new Viewer(canvas);

// ---------- language ----------
function paintLang() { langBtn.textContent = getLocale() === "zh" ? t("lang.en") : t("lang.zh"); }
langBtn.addEventListener("click", () => setLocale((getLocale() === "zh" ? "en" : "zh") as Locale));
onLocale(() => { refreshText(); paintLang(); document.title = t("app"); renderRecordRow(); renderReadout(); });
setLocale(getLocale());

// ---------- reduced motion ----------
const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
let reduced = mq?.matches ?? false;
try { const s = localStorage.getItem("bodymap.reducedMotion"); if (s !== null) reduced = s === "1"; } catch { /* ignore */ }
motion.checked = reduced;
viewer.setReducedMotion(reduced);
document.documentElement.classList.toggle("reduced", reduced);
motion.addEventListener("change", () => {
  viewer.setReducedMotion(motion.checked);
  document.documentElement.classList.toggle("reduced", motion.checked);
  try { localStorage.setItem("bodymap.reducedMotion", motion.checked ? "1" : "0"); } catch { /* ignore */ }
});

// ---------- insets ----------
function measure() {
  const H = window.innerHeight;
  const wide = window.innerWidth >= 760;
  const top = header.getBoundingClientRect().bottom + 4, hintTop = hint.getBoundingClientRect().top;
  viewer.setInsets(top, wide ? 56 : H - hintTop + 6);
  // the view presets float in the free area, never over the panel
  viewDock.style.top = wide ? "50%" : `${Math.round((top + hintTop) / 2)}px`;
}
// Watch the whole dock, not just the panel: the footer wraps to more lines in some languages, which moves the hint
// without resizing the panel, and the body must still re-frame above it.
const insetsWatch = new ResizeObserver(measure);
insetsWatch.observe(panel);
insetsWatch.observe(dock);
window.addEventListener("resize", measure);

// ---------- records on the body ----------
const partLabel = (id: string) => viewer.model?.labels[id]?.[getLocale()] ?? id.replaceAll("_", " ");
const marksKey = (ms: Mark[]) => JSON.stringify(ms.map((m) => [m.location.part_id, m.location.side, m.location.depth, m.location.local, m.shape, m.radius ?? 0, m.to?.part_id ?? ""]));
let shownKey = marksKey([]);
let pendingTo = false; // next tap sets where the last mark goes
let saveT: number | undefined;

function syncBody() {
  const cur = state.current;
  const marks = cur?.marks ?? [];
  const key = marksKey(marks);
  if (key !== shownKey) { viewer.showMarks(marks); shownKey = key; }
  marks.forEach((m, i) => viewer.styleMark(i, m));
  hint.classList.toggle("gone", marks.length > 0 && !pendingTo);
  hint.querySelector("[data-t]")!.setAttribute("data-t", pendingTo ? "mark.to_hint" : cur ? "open_record_hint" : "mark.tap_hint");
  refreshText(hint);
  renderReadout(); renderRecordRow();
}
state.onChange(syncBody);

viewer.onPick = async (p: Pick) => {
  const cur = state.current;
  const loc = { ...p.location };
  if (pendingTo && cur?.marks?.length) {
    // the tap names where the last mark goes; the extra marker the viewer just placed is replaced by a link
    viewer.removeMark(viewer.markers.length - 1);
    const marks = cur.marks.map((m) => ({ ...m }));
    marks[marks.length - 1].to = loc;
    pendingTo = false;
    shownKey = ""; // force redraw with the link
    await state.setMarks(cur, marks);
    return;
  }
  const mark: Mark = { location: loc, shape: "point", intensity: 5 };
  if (cur) {
    if ((cur.marks?.length ?? 0) >= 12) { viewer.removeMark(viewer.markers.length - 1); return; }
    const marks = [...(cur.marks ?? []), mark];
    shownKey = marksKey(marks);
    await state.setMarks(cur, marks);
  } else {
    shownKey = marksKey([mark]);
    const r = await state.add("episode", { marks: [mark] });
    state.setCurrent(r.id);
  }
};

async function patchLastMark(patch: Partial<Mark>) {
  const cur = state.current; if (!cur?.marks?.length) return;
  const marks = cur.marks.map((m) => ({ ...m }));
  const i = marks.length - 1;
  marks[i] = clean({ ...marks[i], ...patch });
  if (patch.shape && patch.shape !== "line" && patch.shape !== "radiating") delete marks[i].to;
  if (patch.shape && patch.shape !== "patch" && patch.shape !== "radiating") delete marks[i].radius;
  shownKey = marksKey(marks); // style only, no redraw
  viewer.styleMark(i, marks[i]);
  clearTimeout(saveT);
  saveT = window.setTimeout(() => state.setMarks(state.latest(cur), marks), 250);
}

// ---------- readout + mark editor ----------
function renderReadout() {
  const cur = state.current;
  const m = cur?.marks?.[cur.marks.length - 1];
  if (!m) { readout.hidden = true; shapeRow.hidden = true; return; }
  const l = m.location;
  readout.hidden = false; shapeRow.hidden = false;
  readout.dataset.partId = l.part_id; readout.dataset.side = l.side; readout.dataset.depth = l.depth; readout.dataset.view = l.view ?? "";
  const intensity = slider({ labelKey: "intensity", min: 0, max: 10, value: m.intensity, onInput: (v) => patchLastMark({ intensity: v ?? 5 }), name: "intensity" });
  const remove = h("button", { type: "button", class: "btn small quiet icon", "aria-label": t("mark.remove"), "data-t-aria": "mark.remove" }, "×");
  remove.addEventListener("click", async () => { const c = state.current!; const marks = c.marks!.slice(0, -1); pendingTo = false; shownKey = marksKey(marks); viewer.removeMark(viewer.markers.length - 1); await state.setMarks(c, marks); });
  readout.replaceChildren(
    h("div", { class: "where" },
      h("span", { class: "dot", "aria-hidden": "true" }),
      h("strong", {}, partLabel(l.part_id)),
      h("span", { class: "meta" }, `${t("side." + l.side)} · ${t("depth." + l.depth)}`),
      h("code", { class: "coord", hidden: "" }, l.local.map((v) => v.toFixed(2)).join(" ")),
      h("span", { class: "spacer" }),
      btn("feels_like", () => openMarkDetails(state.current!, state.current!.marks!.length - 1, () => { pendingTo = true; syncBody(); }), "btn small"),
      remove),
    intensity);
  const shapes: Shape[] = ["point", "patch", "line", "radiating"];
  shapeRow.replaceChildren(
    h("div", { class: "chips", role: "radiogroup" }, ...shapes.map((sh) => chip("shape." + sh, m.shape === sh, () => {
      patchLastMark({ shape: sh, ...(sh === "patch" || sh === "radiating" ? { radius: m.radius ?? 0.3 } : {}) });
      if ((sh === "line" || sh === "radiating") && !m.to) { pendingTo = true; syncBody(); }
      else pendingTo = false;
    }, "radio"))));
}

// ---------- current record row ----------
function renderRecordRow() {
  const cur = state.current;
  recordRow.replaceChildren();
  if (!cur) {
    recordRow.append(
      btn("quick", async () => { shownKey = marksKey([]); const r = await state.add("episode", { marks: [] }); state.setCurrent(r.id); }, "btn now"),
      h("div", { class: "quick-side" }, tx("quick_hint", "p", { class: "muted" }), btn("visit", () => openVisitForm(), "btn small quiet")));
    return;
  }
  const dur = fmtDuration(durationMin(cur));
  const line = h("div", { class: "rec-line" },
    h("span", { class: "rec-time" }, fmtTime(cur.started_at)),
    h("span", { class: "rec-state" }, cur.ended_at ? `${t("ended")} · ${dur ?? ""}` : t("still")));
  const acts = h("div", { class: "rec-actions" });
  if (!cur.ended_at) acts.append(btn("ended", () => state.update(cur, { ended_at: isoLocal() }), "btn small primary"));
  acts.append(btn("details", () => openEpisodeDetails(cur), "btn small"));
  acts.append(btn("new_record", () => { pendingTo = false; state.setCurrent(null); }, "btn small quiet"));
  recordRow.append(line, acts);
}

// ---------- chips ----------
function buildChips() {
  layerRow.replaceChildren(...viewer.layers().map((l: Depth) => {
    const b = chip("depth." + l, viewer.isVisible(l), (b2) => {
      const want = !isOn(b2);
      if (viewer.setLayer(l, want)) setPressed(b2, want);
      else { b2.classList.remove("nudge"); void b2.offsetWidth; b2.classList.add("nudge"); }
    });
    b.dataset.layer = l;
    return b;
  }));
  const views: ViewPreset[] = ["full", "upper", "lower"];
  viewRow.replaceChildren(...views.map((v) => {
    const b = chip("view." + v, v === "full", () => {
      viewRow.querySelectorAll("button").forEach((x) => setPressed(x as HTMLButtonElement, x === b));
      viewer.frameView(v);
    }, "radio");
    b.dataset.view = v;
    return b;
  }));
}

// ---------- tabs ----------
const hooks = {
  partLabel,
  partLabels: () => viewer.model?.labels ?? {},
  showOnBody: (r: Rec) => { state.setCurrent(r.id); selectTab("tab.map"); },
  snapshot: (marks: Mark[], az: number) => { try { return viewer.model ? viewer.snapshot(marks, az) : null; } catch { return null; } },
  modelVersion: () => viewer.model?.modelVersion ?? "unknown",
  version: APP_VERSION,
};
function openTimeline() {
  const body = h("div", { class: "form" });
  const render = () => body.replaceChildren(buildTimeline(state.effective, { width: Math.min(window.innerWidth - 32, 760), onPick: (id) => { const r = state.byId(id); if (r) openDetail(r, hooks); } }));
  render();
  const off = state.onChange(render);
  openSheet("timeline", body, { onClose: off });
}
function openHistory() {
  const body = h("div", { class: "form" });
  const render = () => body.replaceChildren(buildHistory(hooks));
  render();
  const off = state.onChange(render);
  openSheet("history", body, { onClose: off });
}
const tabDefs: [string, () => void][] = [
  ["tab.map", () => closeAllSheets()],
  ["tab.timeline", () => { closeAllSheets(); openTimeline(); }],
  ["tab.history", () => { closeAllSheets(); openHistory(); }],
  ["tab.more", () => { closeAllSheets(); openMore({ ...hooks, partLabels: hooks.partLabels() }); }],
];
const tabBtns = tabDefs.map(([key, fn]) => { const b = tx(key, "button", { type: "button", class: "tab", role: "tab", "aria-selected": String(key === "tab.map") }); b.addEventListener("click", () => { fn(); selectTab(key); }); return b; });
function selectTab(key: string) { tabBtns.forEach((x) => x.setAttribute("aria-selected", String(x.dataset.t === key))); }
tabs.append(...tabBtns);

// ---------- load ----------
const t0 = performance.now();
Promise.all([loadBody(MODEL.url, MODEL.parts), state.load()]).then(([model]) => {
  viewer.setModel(model);
  state.modelVersion = model.modelVersion;
  buildChips();
  measure();
  viewer.frameView("full", false);
  status.remove();
  placeholderTag.hidden = !MODEL.placeholder;
  syncBody();
  document.documentElement.dataset.ready = "1";
  document.documentElement.dataset.loadMs = String(Math.round(performance.now() - t0));
}).catch((err) => {
  console.error(err);
  status.replaceChildren(tx("model.failed"));
  status.classList.add("failed");
});

void toast; void sheetsOpen;

// ---------- test hook (only with ?e2e) ----------
if (new URLSearchParams(location.search).has("e2e")) {
  (window as any).__bodymap = {
    viewer, state,
    screenOf: (x: number, y: number, z: number) => viewer.project(new Vector3(x, y, z)),
    faceAzimuth: (r: number) => viewer.faceAzimuth(r),
    picks: () => viewer.picks.map((p) => {
      const back = viewer.locationToWorld(p.location);
      return { location: p.location, point: p.point.toArray(), surfaceLayer: p.surfacePart.info.layer, roundTripMm: back ? back.point.distanceTo(p.point) * 1000 : null };
    }),
    breath: () => viewer.markers.map((m) => m.mesh.material.uniforms.uBreath.value as number),
    cameraTarget: () => viewer.controls.target.toArray(),
    modelVersion: () => viewer.model?.modelVersion,
    records: () => state.all,
    effective: () => state.effective,
    current: () => state.current,
    snapshot: (az: number) => viewer.snapshot(state.current?.marks ?? [], az, 300, 450),
  };
}
