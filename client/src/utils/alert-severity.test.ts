import { describe, expect, it } from "vitest";
import type { FloodAlert } from "../types/alert.types";
import { highestSeverity, severityByLga, sortAlerts } from "./alert-severity";

const alert = (overrides: Partial<FloodAlert>): FloodAlert => ({
  id: "a",
  severity: "watch",
  status: "active",
  title: "t",
  message: "m",
  actions: [],
  startsAt: "2026-10-30T00:00:00Z",
  expiresAt: "2026-10-31T00:00:00Z",
  endedAt: null,
  areas: [],
  lgaIds: [],
  createdAt: "2026-10-30T00:00:00Z",
  ...overrides,
});

describe("alert severity", () => {
  it("picks the most severe level", () => {
    expect(highestSeverity(["watch", "severe", "warning"])).toBe("severe");
    expect(highestSeverity([])).toBeNull();
  });

  it("colours each LGA by its most severe alert in force, ignoring ended ones", () => {
    const result = severityByLga([
      alert({ id: "1", severity: "watch", lgaIds: ["ph", "okrika"] }),
      alert({ id: "2", severity: "warning", lgaIds: ["ph"] }),
      alert({ id: "3", severity: "severe", status: "ended", lgaIds: ["okrika"] }),
    ]);
    expect(result).toEqual({ ph: "warning", okrika: "watch" });
  });

  it("lists the most severe first, then the newest", () => {
    const sorted = sortAlerts([
      alert({ id: "old-watch", severity: "watch", startsAt: "2026-10-29T00:00:00Z" }),
      alert({ id: "severe", severity: "severe" }),
      alert({ id: "new-watch", severity: "watch", startsAt: "2026-10-30T06:00:00Z" }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["severe", "new-watch", "old-watch"]);
  });
});
