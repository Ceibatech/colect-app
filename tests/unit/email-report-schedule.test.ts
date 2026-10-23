import { describe, expect, it } from "vitest";
import { computeNextEmailReportAt } from "@/lib/email/report-schedule";

describe("computeNextEmailReportAt", () => {
  it("plans the next daily report without returning a past hour", () => {
    const next = computeNextEmailReportAt(
      { frequency: "DAILY", dayOfWeek: 1, dayOfMonth: 1, hourUtc: 7 },
      new Date("2026-10-23T08:15:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-10-24T07:00:00.000Z");
  });

  it("plans a weekly report on the requested weekday", () => {
    const next = computeNextEmailReportAt(
      { frequency: "WEEKLY", dayOfWeek: 1, dayOfMonth: 1, hourUtc: 8 },
      new Date("2026-10-23T08:15:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });

  it("limits monthly scheduling to day 28", () => {
    const next = computeNextEmailReportAt(
      { frequency: "MONTHLY", dayOfWeek: 1, dayOfMonth: 31, hourUtc: 6 },
      new Date("2026-02-28T07:00:00.000Z"),
    );
    expect(next.toISOString()).toBe("2026-03-28T06:00:00.000Z");
  });
});
