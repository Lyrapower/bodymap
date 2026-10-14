import { describe, it, expect } from "vitest";
import { doctorView, selfView, effective } from "../../core/export/export.mjs";
import { route } from "../../core/routing/routing.mjs";
import fixtures from "../../core/fixtures/sample_records.json";
describe("core modules import under vite", () => {
  it("doctorView/selfView/route run", () => {
    const d = doctorView(fixtures as any, { locale: "zh" });
    expect(d.sections.length).toBe(10);
    const s = selfView(fixtures as any, { locale: "en" });
    expect(s.timeline.length).toBeGreaterThan(0);
    const r = route(fixtures as any, { region: "US", locale: "zh" });
    expect(Array.isArray(r.entries)).toBe(true);
    expect(effective(fixtures as any).length).toBe(5);
  });
});
