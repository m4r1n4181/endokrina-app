import { describe, expect, it } from "vitest";
import { clinicDay, formatClinicTime, zonedMidnightUtc } from "../clinic-time";

const TZ = "Europe/Belgrade";

describe("clinicDay", () => {
  it("summer (CEST, UTC+2): local midnight is 22:00Z the day before", () => {
    const day = clinicDay(new Date("2026-09-24T05:15:00Z"), TZ);
    expect(day.date).toBe("2026-09-24");
    expect(day.hour).toBe(7);
    expect(day.startUtc.toISOString()).toBe("2026-09-23T22:00:00.000Z");
    expect(day.endUtc.toISOString()).toBe("2026-09-24T22:00:00.000Z");
  });

  it("winter (CET, UTC+1): local midnight is 23:00Z the day before", () => {
    const day = clinicDay(new Date("2026-01-15T06:00:00Z"), TZ);
    expect(day.date).toBe("2026-01-15");
    expect(day.hour).toBe(7);
    expect(day.startUtc.toISOString()).toBe("2026-01-14T23:00:00.000Z");
    expect(day.endUtc.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("uses the LOCAL date even when UTC is still on the previous day", () => {
    // 22:30Z on the 23rd is already 00:30 on the 24th in Belgrade.
    const day = clinicDay(new Date("2026-09-23T22:30:00Z"), TZ);
    expect(day.date).toBe("2026-09-24");
    expect(day.hour).toBe(0);
  });

  it("spring-forward day is 23 hours long", () => {
    const day = clinicDay(new Date("2026-03-29T08:00:00Z"), TZ);
    expect(day.date).toBe("2026-03-29");
    expect(day.startUtc.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(day.endUtc.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect((day.endUtc.getTime() - day.startUtc.getTime()) / 3_600_000).toBe(23);
  });

  it("fall-back day is 25 hours long", () => {
    const day = clinicDay(new Date("2026-10-25T08:00:00Z"), TZ);
    expect(day.date).toBe("2026-10-25");
    expect(day.startUtc.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(day.endUtc.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect((day.endUtc.getTime() - day.startUtc.getTime()) / 3_600_000).toBe(25);
  });

  it("an evening appointment (20:00 local) falls inside the day, midnight the next day does not", () => {
    const day = clinicDay(new Date("2026-09-24T05:00:00Z"), TZ);
    const evening = new Date("2026-09-24T18:00:00Z"); // 20:00 CEST
    const nextMidnight = new Date("2026-09-24T22:00:00Z"); // 00:00 CEST on the 25th
    expect(evening >= day.startUtc && evening < day.endUtc).toBe(true);
    expect(nextMidnight < day.endUtc).toBe(false);
  });
});

describe("zonedMidnightUtc", () => {
  it("is the identity for UTC", () => {
    expect(zonedMidnightUtc("2026-09-24", "UTC").toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });
});

describe("formatClinicTime", () => {
  it("formats in the clinic timezone with zero padding", () => {
    expect(formatClinicTime(new Date("2026-09-24T07:30:00Z"), TZ)).toBe("09:30");
    expect(formatClinicTime(new Date("2026-01-15T07:05:00Z"), TZ)).toBe("08:05");
  });
});
