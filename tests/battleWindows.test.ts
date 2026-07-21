/**
 * battleWindows — ET→UTC session-window computation, including US DST
 * boundaries (2026: spring forward Mar 8, fall back Nov 1).
 */

import { describe, expect, it } from "vitest";

import {
  isEasternDaylightTime,
  windowBoundsUtc,
} from "@/lib/battles/battleWindows";

describe("windowBoundsUtc", () => {
  it("computes OPENING_BELL in EDT (summer): 9:30–11:00 ET = 13:30–15:00Z", () => {
    expect(windowBoundsUtc("2026-07-13", "OPENING_BELL")).toEqual({
      startAt: "2026-07-13T13:30:00.000Z",
      endAt: "2026-07-13T15:00:00.000Z",
    });
  });

  it("computes all four windows on an EDT date", () => {
    expect(windowBoundsUtc("2026-07-13", "MIDDAY")).toEqual({
      startAt: "2026-07-13T15:00:00.000Z",
      endAt: "2026-07-13T17:00:00.000Z",
    });
    expect(windowBoundsUtc("2026-07-13", "AFTERNOON")).toEqual({
      startAt: "2026-07-13T17:00:00.000Z",
      endAt: "2026-07-13T19:30:00.000Z",
    });
    expect(windowBoundsUtc("2026-07-13", "FULL_SESSION")).toEqual({
      startAt: "2026-07-13T13:30:00.000Z",
      endAt: "2026-07-13T20:00:00.000Z",
    });
  });

  it("computes EST (winter): 9:30 ET = 14:30Z in January", () => {
    expect(windowBoundsUtc("2026-01-15", "OPENING_BELL").startAt).toBe(
      "2026-01-15T14:30:00.000Z",
    );
  });

  it("handles the 2026 spring-forward boundary (second Sunday of March)", () => {
    // Mar 7 is still EST; Mar 8 (DST starts 2 a.m.) is EDT by 9:30 a.m.
    expect(windowBoundsUtc("2026-03-07", "OPENING_BELL").startAt).toBe(
      "2026-03-07T14:30:00.000Z",
    );
    expect(windowBoundsUtc("2026-03-08", "OPENING_BELL").startAt).toBe(
      "2026-03-08T13:30:00.000Z",
    );
  });

  it("handles the 2026 fall-back boundary (first Sunday of November)", () => {
    // Oct 31 is still EDT; Nov 1 (DST ends 2 a.m.) is EST by 9:30 a.m.
    expect(windowBoundsUtc("2026-10-31", "OPENING_BELL").startAt).toBe(
      "2026-10-31T13:30:00.000Z",
    );
    expect(windowBoundsUtc("2026-11-01", "OPENING_BELL").startAt).toBe(
      "2026-11-01T14:30:00.000Z",
    );
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => windowBoundsUtc("07/13/2026", "OPENING_BELL")).toThrow(
      "expected YYYY-MM-DD",
    );
    expect(() => windowBoundsUtc("2026-02-30", "OPENING_BELL")).toThrow(
      "no such day",
    );
    expect(() => windowBoundsUtc("2026-7-13", "OPENING_BELL")).toThrow();
  });
});

describe("isEasternDaylightTime", () => {
  it("classifies months and boundaries correctly", () => {
    expect(isEasternDaylightTime("2026-01-15")).toBe(false);
    expect(isEasternDaylightTime("2026-06-15")).toBe(true);
    expect(isEasternDaylightTime("2026-12-15")).toBe(false);
    expect(isEasternDaylightTime("2026-03-08")).toBe(true);
    expect(isEasternDaylightTime("2026-03-07")).toBe(false);
    expect(isEasternDaylightTime("2026-11-01")).toBe(false);
    expect(isEasternDaylightTime("2026-10-31")).toBe(true);
    // A different year to prove the Sunday math is not hard-coded: 2027
    // springs forward Mar 14 and falls back Nov 7.
    expect(isEasternDaylightTime("2027-03-13")).toBe(false);
    expect(isEasternDaylightTime("2027-03-14")).toBe(true);
    expect(isEasternDaylightTime("2027-11-06")).toBe(true);
    expect(isEasternDaylightTime("2027-11-07")).toBe(false);
  });
});
