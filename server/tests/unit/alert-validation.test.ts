import { describe, expect, it } from "vitest";
import { createAlertSchema, updateAlertSchema } from "../../src/modules/alerts/alert.validation";
import { updateReportSchema } from "../../src/modules/flood-reports/flood-report.validation";

const DAY = 86_400_000;

const body = (days: number) => ({
  body: {
    severity: "warning",
    title: "River Bonny rising",
    message: "The river has burst its banks at Borokiri.",
    actions: [],
    areaIds: ["10000000-0000-4000-8000-000000000101"],
    expiresAt: new Date(Date.now() + days * DAY).toISOString(),
  },
});

describe("how long an alert may last", () => {
  it("allows any number of days up to a year", () => {
    for (const days of [1, 7, 30, 31, 90, 364]) expect(createAlertSchema.safeParse(body(days)).success).toBe(true);
  });

  it("refuses more than a year, with the limit in the message", () => {
    const result = createAlertSchema.safeParse(body(400));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("at most 365 days");
  });

  it("still refuses an alert that ends before it starts", () => {
    expect(createAlertSchema.safeParse(body(-1)).success).toBe(false);
  });
});

const ID = "20000000-0000-4000-8000-000000000001";
const patch = (body: Record<string, unknown>) => updateAlertSchema.safeParse({ params: { id: ID }, body });

describe("editing an alert", () => {
  it("takes only what changes, and does not tell people unless asked", () => {
    const result = patch({ title: "River Bonny flooding" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body).toEqual({ title: "River Bonny flooding", notify: false });
    const told = patch({ severity: "severe", notify: true });
    expect(told.success && told.data.body.notify).toBe(true);
  });

  it("needs at least one change", () => {
    expect(patch({}).success).toBe(false);
    expect(patch({ notify: true }).success).toBe(false);
  });

  it("applies the same rules as issuing: lengths, levels, areas", () => {
    expect(patch({ title: "Hi" }).success).toBe(false);
    expect(patch({ message: "short" }).success).toBe(false);
    expect(patch({ severity: "catastrophic" }).success).toBe(false);
    expect(patch({ areaIds: [] }).success).toBe(false);
    expect(patch({ areaIds: ["not-an-id"] }).success).toBe(false);
  });

  it("refuses fields that can't be edited, such as the start time", () => {
    expect(patch({ startsAt: "2026-10-30T00:00:00.000Z" }).success).toBe(false);
    expect(patch({ createdBy: "someone" }).success).toBe(false);
  });
});

const REPORT_ID = "30000000-0000-4000-8000-000000000001";
const patchReport = (body: Record<string, unknown>) => updateReportSchema.safeParse({ params: { id: REPORT_ID }, body });

describe("editing a report", () => {
  it("takes only what changes", () => {
    expect(patchReport({ description: "Cars are turning back at the junction." }).success).toBe(true);
    expect(patchReport({ waterDepth: "chest" }).success).toBe(true);
  });

  it("takes a new position as longitude and latitude together", () => {
    expect(patchReport({ lon: 7.01, lat: 4.77 }).success).toBe(true);
    expect(patchReport({ lon: 7.01 }).success).toBe(false);
    expect(patchReport({ lat: 4.77 }).success).toBe(false);
    expect(patchReport({ lon: 7.01, lat: 95 }).success).toBe(false);
  });

  it("needs at least one change, and applies the same rules as sending a report", () => {
    expect(patchReport({}).success).toBe(false);
    expect(patchReport({ locationName: "A" }).success).toBe(false);
    expect(patchReport({ description: "too short" }).success).toBe(false);
    expect(patchReport({ waterDepth: "up to the roof" }).success).toBe(false);
  });

  it("refuses fields that can't be edited, such as the status", () => {
    expect(patchReport({ status: "published" }).success).toBe(false);
    expect(patchReport({ reporterId: "someone" }).success).toBe(false);
  });
});
