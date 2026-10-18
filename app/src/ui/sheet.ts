// Full-height glass sheet over the body. One stack; back closes the top one.
import { h, tx, refreshText } from "../dom";

const stack: HTMLElement[] = [];
let host: HTMLElement | null = null;

export function sheetHost() { if (!host) { host = h("div", { class: "sheets" }); document.getElementById("app")!.append(host); } return host; }

let titleSeq = 0;
export function openSheet(titleKey: string | null, body: Node, opts: { onClose?: () => void; cls?: string; titleText?: string } = {}) {
  const back = tx("back", "button", { type: "button", class: "back" });
  const titleId = `sheet-title-${++titleSeq}`;
  const title = titleKey ? tx(titleKey, "h2", { id: titleId }) : h("h2", { id: titleId }, opts.titleText ?? "");
  const el = h("section", { class: "sheet " + (opts.cls ?? ""), role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h("header", { class: "sheet-head" }, back, title),
    h("div", { class: "sheet-body" }, body));
  back.addEventListener("click", () => closeSheet(el));
  (el as any).__onClose = opts.onClose;
  sheetHost().append(el);
  stack.push(el);
  refreshText(el);
  requestAnimationFrame(() => el.classList.add("in"));
  return el;
}
export function closeSheet(el?: HTMLElement) {
  const top = el ?? stack[stack.length - 1];
  if (!top) return;
  const i = stack.indexOf(top); if (i >= 0) stack.splice(i, 1);
  top.classList.remove("in");
  (top as any).__onClose?.();
  setTimeout(() => top.remove(), 220);
}
export function closeAllSheets() { while (stack.length) closeSheet(); }
export const sheetsOpen = () => stack.length;

/** Small transient notice at the top. Never red. */
let toastT: number | undefined;
export function toast(text: string) {
  let el = document.querySelector<HTMLElement>(".toast");
  if (!el) { el = h("div", { class: "toast", role: "status" }); document.getElementById("app")!.append(el); }
  el.textContent = text; el.classList.add("in");
  clearTimeout(toastT); toastT = window.setTimeout(() => el!.classList.remove("in"), 1800);
}
