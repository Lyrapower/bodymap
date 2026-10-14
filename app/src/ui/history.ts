// History: every record (latest version), newest first. Tap -> detail. Detail -> show on body / edit / delete.
import { durationMin } from "../../../core/export/export.mjs";
import { t } from "../i18n";
import { h, tx, btn } from "../dom";
import { fmtDateTime, fmtDuration, sep } from "../format";
import type { Rec } from "../records";
import { state } from "../state";
import { openSheet, closeSheet, closeAllSheets } from "./sheet";
import { openEpisodeDetails, openVisitForm, deptLabel, descLabel } from "./forms";

export interface HistoryHooks { partLabel: (id: string) => string; showOnBody: (r: Rec) => void }

export function buildHistory(hooks: HistoryHooks): HTMLElement {
  const list = h("div", { class: "hist" });
  const recs = [...state.effective].reverse();
  if (!recs.length) list.append(tx("history.empty", "p", { class: "muted center" }));
  for (const r of recs) {
    const card = h("button", { type: "button", class: "card", "data-id": r.id, "data-kind": r.kind },
      h("div", { class: "card-top" }, tx("kind." + r.kind, "span", { class: "kind" }), h("span", { class: "when" }, fmtDateTime(r.started_at))),
      h("div", { class: "card-main" }, summaryLine(r, hooks.partLabel)),
      h("div", { class: "card-sub" }, subLine(r)));
    card.addEventListener("click", () => openDetail(r, hooks));
    list.append(card);
  }
  return list;
}

function summaryLine(r: Rec, partLabel: (id: string) => string): string {
  if (r.kind === "visit") return `${deptLabel(r.visit!.department)}${r.visit?.clinician ? " · " + r.visit.clinician : ""}`;
  if (r.kind === "note") return r.note ?? "";
  const sites = [...new Set((r.marks ?? []).map((m) => `${t("side." + m.location.side)}${partLabel(m.location.part_id)}`))];
  return sites.join(sep()) || t("quick_hint");
}
function subLine(r: Rec): string {
  if (r.kind !== "episode") return r.visit?.said ?? "";
  const d = fmtDuration(durationMin(r));
  const maxI = Math.max(0, ...(r.marks ?? []).map((m) => m.intensity));
  const bits = [d ?? t("still")];
  if (r.marks?.length) bits.push(`${t("intensity")} ${maxI}`);
  return bits.join(" · ");
}

export function openDetail(r: Rec, hooks: HistoryHooks) {
  const live = state.latest(r);
  const rows: HTMLElement[] = [];
  const row = (k: string, v: string | null | undefined) => { if (v) rows.push(h("div", { class: "kv" }, tx(k, "span", { class: "k" }), h("span", { class: "v" }, v))); };
  row("started", fmtDateTime(live.started_at));
  if (live.kind === "episode") row("ended", live.ended_at ? `${fmtDateTime(live.ended_at)} · ${fmtDuration(durationMin(live))}` : t("still"));
  for (const m of live.marks ?? []) {
    rows.push(h("div", { class: "kv mark" },
      h("span", { class: "k" }, h("span", { class: "dot", "aria-hidden": "true" })),
      h("span", { class: "v" },
        h("strong", {}, `${t("side." + m.location.side)} ${hooks.partLabel(m.location.part_id)}`),
        ` · ${t("depth." + m.location.depth)} · ${t("shape." + m.shape)} · ${t("intensity")} ${m.intensity}`,
        m.descriptors?.length ? h("div", { class: "muted" }, m.descriptors.map(descLabel).join(sep())) : "",
        m.note ? h("div", { class: "muted" }, m.note) : "")));
  }
  const c = live.context;
  if (c) {
    row("context.activity", c.activity); if (c.onset) row("context.onset", t("onset." + c.onset));
    row("context.triggers", c.triggers?.join(sep())); row("context.relief", c.relief?.join(sep())); row("context.associated", c.associated?.join(sep()));
    if (c.pattern) row("context.pattern", t("pattern." + c.pattern));
  }
  const mind = live.mind;
  if (mind && (mind.stress != null || mind.mood != null || mind.sleep_hours != null || mind.note)) {
    const parts = [];
    if (mind.stress != null) parts.push(`${t("mind.stress")} ${mind.stress}`);
    if (mind.mood != null) parts.push(`${t("mind.mood")} ${mind.mood}`);
    if (mind.sleep_hours != null) parts.push(`${t("mind.sleep")} ${mind.sleep_hours}`);
    row("mind", parts.join(" · ")); row("mind.note", mind.note);
  }
  if (live.visit) {
    row("visit.department", deptLabel(live.visit.department)); row("visit.clinician", live.visit.clinician);
    row("visit.said", live.visit.said); row("visit.did", live.visit.did); row("visit.next", live.visit.next);
  }
  if (live.tests?.length) row("tests", live.tests.map((x) => `${x.name} · ${t("result." + (x.result === "abnormal" ? "finding" : x.result))}${x.date ? " · " + x.date : ""}`).join("\n"));
  row("note", live.note);

  const actions = h("section", { class: "actions row-actions" });
  if (live.kind === "episode") {
    actions.append(btn("on_body", () => { closeAllSheets(); hooks.showOnBody(live); }, "btn primary"));
    actions.append(btn("edit", () => openEpisodeDetails(live), "btn"));
  } else if (live.kind === "visit") actions.append(btn("edit", () => openVisitForm(live), "btn"));
  actions.append(btn("delete", async () => { if (confirm(t("delete.confirm"))) { await state.remove(live.id); closeSheet(sheet); } }, "btn quiet"));
  const body = h("div", { class: "form detail" }, h("section", {}, ...rows), actions);
  const sheet = openSheet("kind." + live.kind, body, { titleText: fmtDateTime(live.started_at) });
}
