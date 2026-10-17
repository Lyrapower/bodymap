// History cards read "LeftDeltoid" in English: the side and the part were joined with no space (fine in Chinese only).
import { describe, expect, it } from "vitest";
import { siteName } from "../src/format";

describe("siteName", () => {
  it("puts a space between side and part in English", () => {
    expect(siteName("left", "Deltoid", "en")).toBe("Left Deltoid");
  });
  it("writes them together in Chinese", () => {
    expect(siteName("left", "三角肌", "zh")).toBe("左三角肌");
  });
});
