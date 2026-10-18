// Tiny DOM helpers. Every visible string goes through t() via tx(); refreshText() re-renders them on language change.
import { t } from "./i18n";

export const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const h = (tag: string, attrs: Record<string, string> = {}, ...kids: (Node | string | null | undefined | false)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...(kids.filter(Boolean) as (Node | string)[]));
  return el;
};
export const tx = (key: string, tag = "span", attrs: Record<string, string> = {}) => h(tag, { ...attrs, "data-t": key }, t(key));
export function refreshText(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => (el.textContent = t(el.dataset.t!)));
  root.querySelectorAll<HTMLElement>("[data-t-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.tAria!)));
  root.querySelectorAll<HTMLInputElement>("[data-t-ph]").forEach((el) => (el.placeholder = t(el.dataset.tPh!)));
}
export const btn = (key: string, onClick: () => void, cls = "btn") => {
  const b = tx(key, "button", { type: "button", class: cls }) as HTMLButtonElement;
  b.addEventListener("click", onClick);
  return b;
};
/** A pill. A toggle carries aria-pressed; one option of a radiogroup carries aria-checked only (aria-pressed is not allowed on role="radio"). */
export function chip(key: string, pressed: boolean, onClick: (b: HTMLButtonElement) => void, role = "button") {
  const b = h("button", { type: "button", class: "chip", "data-t": key, role }, t(key)) as HTMLButtonElement;
  setPressed(b, pressed);
  b.addEventListener("click", () => onClick(b));
  return b;
}
export function chipText(text: string, pressed: boolean, onClick: (b: HTMLButtonElement) => void) {
  const b = h("button", { type: "button", class: "chip", "aria-pressed": String(pressed) }, text) as HTMLButtonElement;
  b.addEventListener("click", () => onClick(b));
  return b;
}
export function setPressed(b: HTMLButtonElement, on: boolean) { b.setAttribute(b.getAttribute("role") === "radio" ? "aria-checked" : "aria-pressed", String(on)); }
/** Whether a chip is on, whichever attribute it carries. */
export const isOn = (b: HTMLElement) => (b.getAttribute("role") === "radio" ? b.getAttribute("aria-checked") : b.getAttribute("aria-pressed")) === "true";

/** 0..10 slider with "less / more" at the ends and no numbers in the label. */
export function slider(opts: { labelKey: string; min: number; max: number; step?: number; value: number | null; onInput: (v: number | null) => void; ends?: boolean; name?: string }) {
  const input = h("input", { type: "range", min: String(opts.min), max: String(opts.max), step: String(opts.step ?? 1), value: String(opts.value ?? (opts.min + opts.max) / 2), "aria-label": t(opts.labelKey), "data-t-aria": opts.labelKey, name: opts.name ?? opts.labelKey }) as HTMLInputElement;
  const val = h("output", { class: "val" }, opts.value == null ? "–" : String(opts.value));
  const wrap = h("div", { class: "slider" + (opts.value == null ? " unset" : "") },
    tx(opts.labelKey, "span", { class: "label" }),
    opts.ends ? tx("scale.less", "span", { class: "end" }) : null,
    input,
    opts.ends ? tx("scale.more", "span", { class: "end" }) : null,
    val);
  input.addEventListener("input", () => { wrap.classList.remove("unset"); val.textContent = input.value; opts.onInput(Number(input.value)); });
  return wrap;
}

// Field length caps from core/schema/record.schema.json.
const MAXLEN: Record<string, number> = { note: 500, "mind.note": 500, "visit.said": 1000, "visit.did": 1000, "context.activity": 300, "visit.clinician": 100, "visit.department": 100 };
export function textField(key: string, value: string, onChange: (v: string) => void, multiline = false, hintKey?: string) {
  const input = h(multiline ? "textarea" : "input", { class: "field", "aria-label": t(key), "data-t-aria": key, ...(hintKey ? { placeholder: t(hintKey), "data-t-ph": hintKey } : {}), ...(multiline ? { rows: "2" } : { type: "text" }), maxlength: String(MAXLEN[key] ?? 300) }) as HTMLInputElement;
  input.value = value;
  input.addEventListener("input", () => onChange(input.value));
  return h("label", { class: "fieldrow" }, tx(key, "span", { class: "label" }), input);
}

/** Comma / 、 separated list field -> string[] */
export function listField(key: string, value: string[], onChange: (v: string[]) => void) {
  return textField(key, value.join(", "), (v) => onChange(v.split(/[,，、;；\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20)));
}
