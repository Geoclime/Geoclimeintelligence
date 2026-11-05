import { describe, expect, it } from "vitest";
import { alertFormSchema, CUSTOM_DURATION, describeEnd, KEEP_DURATION, MAX_CUSTOM_DAYS, toAlertBody, toAlertUpdate, type AlertFormValues } from "./alert-form.schema";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");

const form = (overrides: Partial<AlertFormValues> = {}): AlertFormValues => ({
  severity: "warning",
  title: "River Bonny rising",
  message: "The river has burst its banks at Borokiri.",
  actions: "Move to higher ground.\n\nCall 112 if in danger.",
  areaIds: ["10000000-0000-4000-8000-000000000101"],
  durationHours: "24",
  customDays: "7",
  notify: false,
  ...overrides,
});

describe("how long an alert lasts", () => {
  it("uses a quick choice as it is", () => {
    expect(toAlertBody(form({ durationHours: "48" }), NOW).expiresAt).toBe("2026-11-01T12:00:00.000Z");
  });

  it("takes any whole number of days when custom is chosen", () => {
    expect(toAlertBody(form({ durationHours: CUSTOM_DURATION, customDays: "10" }), NOW).expiresAt).toBe("2026-11-09T12:00:00.000Z");
    expect(toAlertBody(form({ durationHours: CUSTOM_DURATION, customDays: "45" }), NOW).expiresAt).toBe("2026-12-14T12:00:00.000Z");
    expect(toAlertBody(form({ durationHours: CUSTOM_DURATION, customDays: String(MAX_CUSTOM_DAYS) }), NOW).expiresAt).toBe("2027-10-30T12:00:00.000Z");
  });

  it("ignores the typed days unless custom is chosen", () => {
    expect(toAlertBody(form({ durationHours: "6", customDays: "99" }), NOW).expiresAt).toBe("2026-10-30T18:00:00.000Z");
    expect(alertFormSchema.safeParse(form({ durationHours: "6", customDays: "nonsense" })).success).toBe(true);
  });

  it("accepts 1 to the limit, and nothing else, as custom days", () => {
    const ok = (customDays: string) => alertFormSchema.safeParse(form({ durationHours: CUSTOM_DURATION, customDays })).success;
    for (const days of ["1", "30", "31", "100", String(MAX_CUSTOM_DAYS)]) expect(ok(days)).toBe(true);
    for (const days of ["", " ", "0", "-3", "1.5", "abc", String(MAX_CUSTOM_DAYS + 1), "3650"]) expect(ok(days)).toBe(false);
  });

  it("puts the error on the days field", () => {
    const result = alertFormSchema.safeParse(form({ durationHours: CUSTOM_DURATION, customDays: "0" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["customDays"]);
  });
});

describe("describeEnd", () => {
  it("writes out when the alert would end", () => {
    expect(describeEnd({ durationHours: CUSTOM_DURATION, customDays: "10" }, { now: NOW })).toContain("2026");
  });

  it("says nothing while the duration isn't a usable number", () => {
    expect(describeEnd({ durationHours: CUSTOM_DURATION, customDays: "" }, { now: NOW })).toBeNull();
    expect(describeEnd({ durationHours: CUSTOM_DURATION, customDays: "abc" }, { now: NOW })).toBeNull();
    expect(describeEnd({ durationHours: CUSTOM_DURATION, customDays: "0" }, { now: NOW })).toBeNull();
    expect(describeEnd({ durationHours: CUSTOM_DURATION, customDays: String(MAX_CUSTOM_DAYS + 1) }, { now: NOW })).toBeNull();
  });
});

describe("editing an alert", () => {
  it("sends the new end time only when one was chosen", () => {
    expect(toAlertUpdate(form({ durationHours: KEEP_DURATION }), NOW)).not.toHaveProperty("expiresAt");
    expect(toAlertUpdate(form({ durationHours: "48" }), NOW).expiresAt).toBe("2026-11-01T12:00:00.000Z");
    expect(toAlertUpdate(form({ durationHours: CUSTOM_DURATION, customDays: "10" }), NOW).expiresAt).toBe("2026-11-09T12:00:00.000Z");
  });

  it("sends the changed fields, the areas, and whether to tell people", () => {
    expect(toAlertUpdate(form({ durationHours: KEEP_DURATION, notify: true }), NOW)).toEqual({
      severity: "warning",
      title: "River Bonny rising",
      message: "The river has burst its banks at Borokiri.",
      actions: ["Move to higher ground.", "Call 112 if in danger."],
      areaIds: ["10000000-0000-4000-8000-000000000101"],
      notify: true,
    });
  });

  it("describes the current end time when it is kept", () => {
    expect(describeEnd({ durationHours: KEEP_DURATION, customDays: "7" }, { currentEnd: "2026-11-11T02:18:00.000Z" })).toContain("2026");
    expect(describeEnd({ durationHours: KEEP_DURATION, customDays: "7" })).toBeNull();
  });

  it("accepts the keep choice as a valid form", () => {
    expect(alertFormSchema.safeParse(form({ durationHours: KEEP_DURATION })).success).toBe(true);
  });
});
