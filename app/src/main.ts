import "./style.css";
import { Vector3 } from "three";
import { t, getLocale, setLocale, onLocale, type Locale } from "./i18n";
import { loadBody } from "./body/model";
import type { Depth } from "./body/naming";
import { Viewer, type Pick, type ViewPreset } from "./viewer/viewer";
import { MODEL } from "./config";

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const h = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

// Every visible string is bound with data-t and refreshed on language change.
const tx = (key: string, tag = "span", attrs: Record<string, string> = {}) => h(tag, { ...attrs, "data-t": key }, t(key));
function refreshText() {
  document.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t!)));
  document.querySelectorAll<HTMLElement>("[data-t-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tAria!)));
  document.title = t("app");
  renderReadout();
}

const app = $("#app");
const canvas = h("canvas", { id: "scene", "data-t-aria": "mark.tap_hint", role: "img" }) as HTMLCanvasElement;
const langBtn = h("button", { class: "lang", type: "button" });
const header = h("header", { class: "top" },
  h("div", { class: "brand" }, tx("app", "h1"), tx("tagline", "p")),
  langBtn);
const status = h("div", { class: "status", role: "status" }, tx("model.loading"));
const hint = h("div", { class: "hint", "aria-hidden": "true" }, tx("mark.tap_hint"));
const readout = h("div", { class: "readout", hidden: "" });
const layerRow = h("div", { class: "chips", role: "group" });
const viewRow = h("div", { class: "chips", role: "radiogroup" });
const motion = h("input", { type: "checkbox", id: "reduced" }) as HTMLInputElement;
const panel = h("section", { class: "panel" },
  readout,
  h("div", { class: "row" }, tx("layer", "span", { class: "label" }), layerRow),
  h("div", { class: "row" }, tx("view", "span", { class: "label" }), viewRow),
  h("div", { class: "row foot" },
    h("label", { class: "switch", for: "reduced" }, motion, h("span", { class: "knob", "aria-hidden": "true" }), tx("settings.reduced_motion")),
    tx("built_with", "span", { class: "built" })));
const footer = h("footer", { class: "foot-note" }, tx("footer.record_only", "p"), tx("footer.emergency", "p"));
const placeholderTag = h("span", { class: "tag", hidden: "" }, tx("model.placeholder"));
header.querySelector(".brand")!.append(placeholderTag);
const dock = h("div", { class: "dock" }, hint, panel, footer);
app.append(canvas, header, status, dock);

const viewer = new Viewer(canvas);

// ---------- language ----------
function paintLang() { langBtn.textContent = getLocale() === "zh" ? t("lang.en") : t("lang.zh"); }
langBtn.addEventListener("click", () => setLocale((getLocale() === "zh" ? "en" : "zh") as Locale));
onLocale(() => { refreshText(); paintLang(); });
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

// ---------- insets: keep the body centred between header and panel ----------
function measure() {
  const H = window.innerHeight;
  const wide = window.innerWidth >= 760; // panel sits to the right on wide screens
  viewer.setInsets(header.getBoundingClientRect().bottom + 4, wide ? 56 : H - panel.getBoundingClientRect().top + 8);
}
new ResizeObserver(measure).observe(panel);
window.addEventListener("resize", measure);

// ---------- readout of the last mark ----------
let last: Pick | null = null;
function partLabel(id: string) { return viewer.model?.labels[id]?.[getLocale()] ?? id; }
function renderReadout() {
  if (!last) { readout.hidden = true; return; }
  const l = last.location;
  readout.hidden = false;
  readout.dataset.partId = l.part_id; readout.dataset.side = l.side; readout.dataset.depth = l.depth; readout.dataset.view = l.view;
  readout.replaceChildren(
    h("div", { class: "where" },
      h("span", { class: "dot", "aria-hidden": "true" }),
      h("strong", {}, partLabel(l.part_id)),
      h("span", { class: "meta" }, `${t("side." + l.side)} · ${t("depth." + l.depth)}`)),
    h("code", { class: "coord" }, l.local.map((v) => v.toFixed(2)).join("  ")));
}
viewer.onPick = (p) => { last = p; renderReadout(); hint.classList.add("gone"); };

// ---------- chips ----------
function chip(key: string, pressed: boolean, onClick: (b: HTMLButtonElement) => void, role = "button") {
  const b = h("button", { type: "button", class: "chip", "data-t": key, "aria-pressed": String(pressed), role }, t(key)) as HTMLButtonElement;
  if (role === "radio") b.setAttribute("aria-checked", String(pressed));
  b.addEventListener("click", () => onClick(b));
  return b;
}
function buildChips() {
  layerRow.replaceChildren(...viewer.layers().map((l: Depth) => {
    const b = chip("depth." + l, viewer.isVisible(l), (btn) => {
      const want = btn.getAttribute("aria-pressed") !== "true";
      if (viewer.setLayer(l, want)) btn.setAttribute("aria-pressed", String(want));
      else { btn.classList.remove("nudge"); void btn.offsetWidth; btn.classList.add("nudge"); }
    });
    b.dataset.layer = l;
    return b;
  }));
  const views: ViewPreset[] = ["full", "upper", "lower"];
  viewRow.replaceChildren(...views.map((v) => {
    const b = chip("view." + v, v === "full", () => {
      viewRow.querySelectorAll("button").forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.setAttribute("aria-checked", String(x === b)); });
      viewer.frameView(v);
    }, "radio");
    b.dataset.view = v;
    return b;
  }));
}

// ---------- load ----------
const t0 = performance.now();
loadBody(MODEL.url, MODEL.parts).then((model) => {
  viewer.setModel(model);
  buildChips();
  measure();
  viewer.frameView("full", false);
  status.remove();
  placeholderTag.hidden = !MODEL.placeholder;
  document.documentElement.dataset.ready = "1";
  document.documentElement.dataset.loadMs = String(Math.round(performance.now() - t0));
}).catch((err) => {
  console.error(err);
  status.replaceChildren(tx("model.failed"));
  status.classList.add("failed");
});

// ---------- test hook (only with ?e2e) ----------
if (new URLSearchParams(location.search).has("e2e")) {
  {
    (window as any).__bodymap = {
      viewer,
      screenOf: (x: number, y: number, z: number) => viewer.project(new Vector3(x, y, z)),
      faceAzimuth: (r: number) => viewer.faceAzimuth(r),
      picks: () => viewer.picks.map((p) => {
        const back = viewer.locationToWorld(p.location);
        return { location: p.location, point: p.point.toArray(), surfaceLayer: p.surfacePart.info.layer, roundTripMm: back ? back.point.distanceTo(p.point) * 1000 : null };
      }),
      breath: () => viewer.markers.map((m) => m.mesh.material.uniforms.uBreath.value as number),
      cameraTarget: () => viewer.controls.target.toArray(),
      modelVersion: () => viewer.model?.modelVersion,
    };
  }
}
