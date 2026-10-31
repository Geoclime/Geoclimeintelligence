import { describe, expect, it } from "vitest";
import type { FloodAlert } from "../types/alert.types";
import type { PublicReportPoint, WaterDepth } from "../types/flood-report.types";
import type { PublicFloodPoint } from "../types/public.types";
import { stripStatus } from "./alert-strip";

const alert = (severity: FloodAlert["severity"]): FloodAlert => ({
  id: severity,
  severity,
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
});

const report = (waterDepth: WaterDepth, id: string = waterDepth): PublicReportPoint => ({ id, point: [7, 4.8], waterDepth, lgaName: "Port Harcourt", createdAt: "2026-10-30T08:00:00Z" });

const flood = (areaM2: number, id: string = String(areaM2)): PublicFloodPoint => ({ id, point: [7, 4.8], areaM2, depth: "knee", lgaName: "Obio/Akpor", observedAt: "2026-10-31T09:00:00Z" });

describe("stripStatus", () => {
  it("is the green all-clear only when there are no alerts and no reports", () => {
    expect(stripStatus([], [], 7)).toEqual({ tone: "clear", text: "No flood alerts in force right now.", linkLabel: "Alert map" });
  });

  it("is not the all-clear when community reports have been published and no alert is in force", () => {
    const status = stripStatus([], [report("waist"), report("chest", "r2")], 7);
    expect(status.tone).toBe("reports");
    expect(status.text).toBe("No official flood alerts in force. 2 community flood reports in the last 7 days, the deepest chest-deep.");
    expect(status.linkLabel).toBe("See the reports");
  });

  it("says report and day in the singular", () => {
    expect(stripStatus([], [report("knee")], 1).text).toBe("No official flood alerts in force. 1 community flood report in the last 1 day, the deepest knee-deep.");
  });

  it("names the deepest report, whatever order they arrive in", () => {
    expect(stripStatus([], [report("impassable"), report("ankle", "r2")], 7).text).toContain("the deepest impassable");
    expect(stripStatus([], [report("ankle"), report("knee", "r2")], 7).text).toContain("the deepest knee-deep");
  });

  it("is not the all-clear when a responder has recorded a flood on the ground, even with no reports and no alerts", () => {
    const status = stripStatus([], [], 7, [flood(32_000), flood(1_200, "f2")], 3);
    expect(status.tone).toBe("reports");
    expect(status.text).toBe("No official flood alerts in force. 2 floods recorded on the ground in the last 3 days, the largest 3.2 ha.");
    expect(status.linkLabel).toBe("See the map");
  });

  it("says flood and day in the singular", () => {
    expect(stripStatus([], [], 7, [flood(850)], 1).text).toBe("No official flood alerts in force. 1 flood recorded on the ground in the last 1 day, the largest 850 m².");
  });

  it("names both when there are community reports and recorded floods, and sends people to the reports", () => {
    const status = stripStatus([], [report("chest")], 7, [flood(32_000)], 3);
    expect(status.text).toBe(
      "No official flood alerts in force. 1 community flood report in the last 7 days, the deepest chest-deep; 1 flood recorded on the ground in the last 3 days, the largest 3.2 ha.",
    );
    expect(status.linkLabel).toBe("See the reports");
  });

  it("still leads with the official alert when floods have been recorded too", () => {
    const status = stripStatus([alert("severe")], [], 7, [flood(32_000)], 3);
    expect(status.tone).toBe("severe");
    expect(status.text).toBe("1 flood alert in force, the highest a severe flood warning.");
  });

  it("leads with the official alert, in its own colour, when one is in force", () => {
    const status = stripStatus([alert("watch"), alert("warning")], [report("chest")], 7);
    expect(status.tone).toBe("warning");
    expect(status.text).toBe("2 flood alerts in force, the highest a flood warning.");
    expect(status.linkLabel).toBe("See the alerts");
  });
});
