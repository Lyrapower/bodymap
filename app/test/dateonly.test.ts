// A test date typed into a date field ("2026-09-24") must print as that day for a reader west of UTC.
// Before the fix it printed 9/23 in Los Angeles: new Date("2026-09-24") is UTC midnight.
process.env.TZ = "America/Los_Angeles";
import { describe, expect, it } from "vitest";
import { fmtDate, fmtShortDate, parseWhen } from "../src/format";

describe("date-only strings in a time zone west of UTC", () => {
  it("the process really is in Los Angeles time", () => {
    expect(new Date("2026-09-24T12:00:00Z").getTimezoneOffset()).toBe(420);
  });
  it("prints the calendar day that was typed, not the day before", () => {
    expect(fmtDate("2026-09-24")).toBe("9/24/2026");
    expect(fmtShortDate("2026-01-01")).toBe("1/1");
    expect(parseWhen("2026-09-24").getDate()).toBe(24);
  });
  it("leaves full timestamps alone", () => {
    expect(fmtDate("2026-09-24T23:30:00-07:00")).toBe("9/24/2026");
    expect(fmtDate("2026-09-25T02:00:00Z")).toBe("9/24/2026");
  });
});
