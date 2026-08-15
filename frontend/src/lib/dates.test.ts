import { describe, it, expect } from "vitest";
import { defaultLoadRange, eventRangeForDate, localDateTimeToISO, toDatetimeLocalValue } from "./dates";
import { isCompletedToday, scheduleFromTask, todayStr } from "./taskSchedule";

describe("dates", () => {
  it("converts ISO to datetime-local and back without shifting the instant", () => {
    const iso = "2026-08-14T15:30:00.000Z";
    const local = toDatetimeLocalValue(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localDateTimeToISO(local)).toBe(new Date(iso).toISOString());
  });

  it("builds an event range covering the previous and next month", () => {
    const { start, end } = eventRangeForDate(new Date(2026, 7, 14), 1);
    expect(new Date(start).getMonth()).toBe(6);
    expect(new Date(end).getMonth()).toBe(8);
  });

  it("loads a window that includes past days", () => {
    const { start, end } = defaultLoadRange(45, 90);
    expect(new Date(start).getTime()).toBeLessThan(Date.now());
    expect(new Date(end).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("taskSchedule", () => {
  it("treats only today's completion as done", () => {
    expect(isCompletedToday(todayStr())).toBe(true);
    expect(isCompletedToday("1999-01-01")).toBe(false);
    expect(isCompletedToday(null)).toBe(false);
  });

  it("encodes weekly and custom fields for the backend", () => {
    expect(
      scheduleFromTask({
        weekdays: [1, 3],
        custom_schedule: "monthly",
        custom_monthday: 15,
      })
    ).toEqual({
      weekdays: [1, 3],
      custom_schedule: "monthly",
      custom_monthday: 15,
    });
  });
});
