import { describe, expect, it } from "vitest";
import { gapLabel, textWidth11 } from "../src/ui/gapLabel";

const fullEn = "Nothing recorded here · 8 days", shortEn = "8 days";
const fullZh = "这段没有记录 · 8 天", shortZh = "8 天";

describe("gap label", () => {
  it("uses the full sentence when it fits", () => {
    expect(gapLabel(400, fullEn, shortEn)).toBe(fullEn);
    expect(gapLabel(200, fullZh, shortZh)).toBe(fullZh);
  });
  it("falls back to the short form instead of overflowing into the next gap", () => {
    // the English sentence is ~170px; a 100px gap used to get it anyway (threshold was 70px)
    expect(textWidth11(fullEn)).toBeGreaterThan(150);
    expect(gapLabel(100, fullEn, shortEn)).toBe(shortEn);
  });
  it("drops the label when not even the short form fits", () => {
    expect(gapLabel(30, fullEn, shortEn)).toBeNull();
    expect(gapLabel(0, fullZh, shortZh)).toBeNull();
  });
  it("counts CJK glyphs wider than Latin ones", () => {
    expect(textWidth11("天天")).toBeGreaterThan(textWidth11("dd"));
  });
});
