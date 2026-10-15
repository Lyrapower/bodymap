import { describe, expect, it } from "vitest";
import { dateRange } from "../src/format";

describe("dateRange", () => {
  it("writes one date when both ends fall on the same day", () => {
    const r = dateRange("2026-10-14T12:00:00Z", "2026-10-14T12:30:00Z"); // same calendar day in every time zone
    expect(r.split("–").length).toBe(1);
    expect(r.startsWith(" · ")).toBe(true);
  });
  it("writes a range across days", () => {
    expect(dateRange("2026-10-01T08:00:00-07:00", "2026-10-14T08:00:00-07:00")).toContain(" – ");
  });
  it("handles a missing end", () => {
    expect(dateRange(null, null)).toBe("");
    expect(dateRange("2026-10-01T08:00:00-07:00", null).includes("–")).toBe(false);
  });
});
