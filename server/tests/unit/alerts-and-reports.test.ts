import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/common/access/auth-user";
import { RegionAccess } from "../../src/common/access/region-access";
import { domainEvents } from "../../src/common/events/domain-events";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../src/common/errors/app-error";
import { AlertService } from "../../src/modules/alerts/alert.service";
import { alertStatus, type FloodAlertPatch, type FloodAlertRow, type IAlertRepository, type NewFloodAlert } from "../../src/modules/alerts/alert.types";
import { FloodReportService } from "../../src/modules/flood-reports/flood-report.service";
import type { FloodReportPatch, FloodReportRow, IFloodReportRepository, NewFloodReport, ReviewDecision } from "../../src/modules/flood-reports/flood-report.types";
import { sniffMedia } from "../../src/modules/flood-reports/media-check";
import type { IMediaStorage, StoredMedia, UploadInput } from "../../src/common/storage/media-storage";
import { InMemoryAdminUnitRepository, makeUnit } from "../geo-fakes";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });
const portHarcourt = makeUnit({ level: 2, levelName: "LGA", unitName: "Port Harcourt", parentId: rivers.id });
const okrika = makeUnit({ level: 2, levelName: "LGA", unitName: "Okrika", parentId: rivers.id });
const ward = makeUnit({ level: 3, levelName: "Ward", unitName: "Phward 2", parentId: portHarcourt.id });

const user = (role: AuthUser["role"], scopeAdminUnitId: string | null = null, id = `u-${role}`): AuthUser => ({
  id,
  firebaseUid: id,
  email: null,
  displayName: null,
  role,
  scopeAdminUnitId,
  profileComplete: true,
});

/** Region scope over the fake areas: a scope covers itself and its children. */
function regions(units: InMemoryAdminUnitRepository) {
  return new RegionAccess({
    isDescendantOrSelf: async (target, ancestor) => {
      let current = units.units.find((u) => u.id === target);
      while (current) {
        if (current.id === ancestor) return true;
        current = units.units.find((u) => u.id === current!.parentId);
      }
      return false;
    },
    subtreeIds: async (root) => [root, ...units.units.filter((u) => u.parentId === root).map((u) => u.id)],
  });
}

class FakeAlerts implements IAlertRepository {
  rows = new Map<string, FloodAlertRow>();
  async create(input: NewFloodAlert) {
    const id = `alert-${this.rows.size + 1}`;
    this.rows.set(id, {
      id,
      severity: input.severity,
      title: input.title,
      message: input.message,
      actions: input.actions.join("\n"),
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      endedAt: null,
      createdAt: NOW,
      areas: input.areaIds.map((areaId) => ({ id: areaId, unitName: areaId, levelName: "LGA", level: 2 })),
      lgaIds: input.areaIds,
    });
    return id;
  }
  async findAlert(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findList() {
    return [...this.rows.values()];
  }
  async end(id: string, at: Date) {
    const row = this.rows.get(id);
    if (!row || row.endedAt) return false;
    row.endedAt = at;
    return true;
  }
  async update(id: string, patch: FloodAlertPatch) {
    const row = this.rows.get(id);
    if (!row) return false;
    if (patch.severity !== undefined) row.severity = patch.severity;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.message !== undefined) row.message = patch.message;
    if (patch.actions !== undefined) row.actions = patch.actions.join("\n");
    if (patch.expiresAt !== undefined) row.expiresAt = patch.expiresAt;
    if (patch.areaIds !== undefined) {
      row.areas = patch.areaIds.map((areaId) => ({ id: areaId, unitName: areaId, levelName: "LGA", level: 2 }));
      row.lgaIds = patch.areaIds;
    }
    return true;
  }
  async remove(id: string) {
    return this.rows.delete(id);
  }
}

function alertSetup() {
  const units = new InMemoryAdminUnitRepository([rivers, portHarcourt, okrika, ward]);
  const repo = new FakeAlerts();
  return { repo, service: new AlertService(repo, units, regions(units), () => NOW) };
}

const alertBody = (areaIds: string[]) => ({
  severity: "warning" as const,
  title: "River Bonny rising",
  message: "Water levels are rising after two days of heavy rain.",
  actions: ["Move valuables to higher ground.", "Avoid crossing flooded roads."],
  areaIds,
  expiresAt: "2026-10-31T12:00:00.000Z",
});

describe("AlertService", () => {
  it("issues an alert in force now, with its actions as a list", async () => {
    const alert = await alertSetup().service.create(alertBody([portHarcourt.id]), user("government_official"));
    expect(alert).toMatchObject({ status: "active", severity: "warning", actions: ["Move valuables to higher ground.", "Avoid crossing flooded roads."] });
  });

  it("refuses a ward, and an area outside the issuer's region", async () => {
    const { service } = alertSetup();
    await expect(service.create(alertBody([ward.id]), user("government_official"))).rejects.toBeInstanceOf(ValidationError);
    await expect(service.create(alertBody([okrika.id]), user("government_official", portHarcourt.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("edits an alert in force: only what is sent changes", async () => {
    const { service } = alertSetup();
    const alert = await service.create(alertBody([portHarcourt.id]), user("government_official"));
    const edited = await service.update(alert.id, { severity: "severe", message: "The river has burst its banks at Borokiri.", notify: false }, user("government_official"));
    expect(edited).toMatchObject({ status: "active", severity: "severe", title: "River Bonny rising", message: "The river has burst its banks at Borokiri." });
    expect(edited.actions).toEqual(alert.actions);
    expect(edited.areas.map((area) => area.id)).toEqual([portHarcourt.id]);
  });

  it("replaces the areas, and checks each new one like an issue does", async () => {
    const { service } = alertSetup();
    const official = user("government_official", rivers.id);
    const alert = await service.create(alertBody([portHarcourt.id]), official);
    expect((await service.update(alert.id, { areaIds: [okrika.id, portHarcourt.id], notify: false }, official)).areas).toHaveLength(2);
    await expect(service.update(alert.id, { areaIds: [ward.id], notify: false }, official)).rejects.toBeInstanceOf(ValidationError);

    const local = user("government_official", portHarcourt.id);
    const own = await service.create(alertBody([portHarcourt.id]), local);
    await expect(service.update(own.id, { areaIds: [okrika.id], notify: false }, local)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("won't let someone edit an alert covering an area outside their region", async () => {
    const { service } = alertSetup();
    const alert = await service.create(alertBody([okrika.id]), user("administrator"));
    await expect(service.update(alert.id, { title: "A better title" , notify: false }, user("government_official", portHarcourt.id))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("moves the end time, but not into the past or beyond a year", async () => {
    const { service } = alertSetup();
    const official = user("government_official");
    const alert = await service.create(alertBody([portHarcourt.id]), official);
    expect((await service.update(alert.id, { expiresAt: "2026-12-01T00:00:00.000Z", notify: false }, official)).expiresAt).toBe("2026-12-01T00:00:00.000Z");
    await expect(service.update(alert.id, { expiresAt: "2026-10-29T00:00:00.000Z", notify: false }, official)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(alert.id, { expiresAt: "2027-12-01T00:00:00.000Z", notify: false }, official)).rejects.toBeInstanceOf(ValidationError);
  });

  it("leaves an ended alert as a record: it can't be edited, but it can be deleted", async () => {
    const { service } = alertSetup();
    const official = user("government_official");
    const alert = await service.create(alertBody([portHarcourt.id]), official);
    await service.end(alert.id, official);
    await expect(service.update(alert.id, { title: "A better title", notify: false }, official)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.remove(alert.id, official)).resolves.toBeUndefined();
  });

  it("deletes an alert for good, only inside the deleter's region", async () => {
    const { service, repo } = alertSetup();
    const alert = await service.create(alertBody([okrika.id]), user("administrator"));
    await expect(service.remove(alert.id, user("government_official", portHarcourt.id))).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.rows.has(alert.id)).toBe(true);

    await service.remove(alert.id, user("administrator"));
    expect(repo.rows.has(alert.id)).toBe(false);
    await expect(service.remove(alert.id, user("administrator"))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("says whether to tell people about an edit, and announces a deletion", async () => {
    const seen: string[] = [];
    domainEvents.on("alert.updated", ({ notify }) => void seen.push(`updated:${notify}`));
    domainEvents.on("alert.deleted", () => void seen.push("deleted"));
    try {
      const { service } = alertSetup();
      const official = user("government_official");
      const alert = await service.create(alertBody([portHarcourt.id]), official);
      await service.update(alert.id, { title: "A better title", notify: false }, official);
      await service.update(alert.id, { severity: "severe", notify: true }, official);
      await service.remove(alert.id, official);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(seen).toEqual(["updated:false", "updated:true", "deleted"]);
    } finally {
      domainEvents.clear();
    }
  });

  it("ends an alert early, once", async () => {
    const { service } = alertSetup();
    const alert = await service.create(alertBody([portHarcourt.id]), user("government_official"));
    expect((await service.end(alert.id, user("administrator"))).status).toBe("ended");
    await expect(service.end(alert.id, user("administrator"))).rejects.toBeInstanceOf(ConflictError);
  });

  it("works out the status from the times", () => {
    const base = { startsAt: new Date("2026-10-30T00:00:00Z"), expiresAt: new Date("2026-10-31T00:00:00Z"), endedAt: null };
    expect(alertStatus(base, NOW)).toBe("active");
    expect(alertStatus({ ...base, startsAt: new Date("2026-10-30T18:00:00Z") }, NOW)).toBe("scheduled");
    expect(alertStatus({ ...base, expiresAt: new Date("2026-10-30T06:00:00Z") }, NOW)).toBe("expired");
    expect(alertStatus({ ...base, endedAt: NOW }, NOW)).toBe("ended");
  });
});

class FakeReports implements IFloodReportRepository {
  rows = new Map<string, FloodReportRow>();
  created: NewFloodReport[] = [];
  recent = 0;
  async create(input: NewFloodReport) {
    this.created.push(input);
    const id = `report-${this.rows.size + 1}`;
    this.rows.set(id, {
      id,
      reporterId: input.reporterId,
      reporterName: "Ada Obi",
      reporterOrganisation: null,
      point: input.point,
      locationName: input.locationName,
      lgaId: input.lgaId,
      lgaName: input.lgaId ? "Port Harcourt" : null,
      wardId: input.wardId,
      wardName: input.wardId ? "Phward 2" : null,
      waterDepth: input.waterDepth,
      description: input.description,
      status: "pending",
      reviewNote: null,
      reviewedAt: null,
      createdAt: NOW,
      media: input.media.map((item, index) =>
        item.storage === "cloudinary"
          ? { id: `media-${index + 1}`, kind: item.kind, mimeType: item.mimeType, byteSize: item.stored.byteSize, storage: "cloudinary" as const, publicId: item.stored.publicId, resourceType: item.stored.resourceType, format: item.stored.format, version: item.stored.version }
          : { id: `media-${index + 1}`, kind: item.kind, mimeType: item.mimeType, byteSize: item.data.length, storage: "database" as const, publicId: null, resourceType: null, format: null, version: null },
      ),
    });
    return id;
  }
  async update(id: string, patch: FloodReportPatch) {
    const row = this.rows.get(id);
    if (!row || row.status === "published") return false;
    if (patch.locationName !== undefined) row.locationName = patch.locationName;
    if (patch.waterDepth !== undefined) row.waterDepth = patch.waterDepth;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.point !== undefined) {
      row.point = patch.point;
      row.lgaId = patch.lgaId ?? null;
      row.lgaName = patch.lgaId ? "Okrika" : null;
      row.wardId = patch.wardId ?? null;
      row.wardName = patch.wardId ? "Phward 2" : null;
    }
    if (patch.resubmit) Object.assign(row, { status: "pending", reviewNote: null, reviewedAt: null });
    return true;
  }
  async remove(id: string) {
    return this.rows.delete(id);
  }
  async findReport(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findReportPage() {
    return { items: [...this.rows.values()], meta: { page: 1, pageSize: 25, total: this.rows.size } };
  }
  async review(id: string, decision: ReviewDecision) {
    const row = this.rows.get(id);
    if (!row || row.status !== "pending") return false;
    Object.assign(row, { status: decision.status, reviewNote: decision.note, reviewedAt: decision.at });
    return true;
  }
  async findMedia() {
    return null;
  }
  async countSince() {
    return this.recent;
  }
  async findPublishedSince() {
    return [];
  }
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const reportBody = { lon: 7.0, lat: 4.81, locationName: "Aba Road by Garrison", waterDepth: "knee" as const, description: "Road under water, cars turning back." };

/** Cloudinary stand-in: records uploads and removals; `failNext` makes the next upload fail. */
class FakeStorage implements IMediaStorage {
  uploads: UploadInput[] = [];
  removed: string[] = [];
  failNext = false;
  duration: number | null = null;
  constructor(readonly enabled: boolean) {}
  async upload(input: UploadInput): Promise<StoredMedia> {
    if (this.failNext) throw new Error("network down");
    this.uploads.push(input);
    return { publicId: `geoclime/${input.folder}/file-${this.uploads.length}`, resourceType: input.resourceType, format: "jpg", version: 1, byteSize: input.data.length, duration: this.duration };
  }
  deliveryUrl(media: { publicId: string }) {
    return `https://res.cloudinary.com/demo/signed/${media.publicId}`;
  }
  async remove(media: { publicId: string }) {
    this.removed.push(media.publicId);
  }
}

function reportSetup(cloud = false) {
  const units = new InMemoryAdminUnitRepository([rivers, portHarcourt, okrika, ward]);
  units.containing = [rivers, portHarcourt, ward];
  const repo = new FakeReports();
  const storage = new FakeStorage(cloud);
  return { repo, units, storage, service: new FloodReportService(repo, units, regions(units), storage, () => NOW) };
}

describe("FloodReportService", () => {
  it("files a report under the LGA and ward containing the point, pending review", async () => {
    const { service, repo } = reportSetup();
    const report = await service.submit(user("general_public"), reportBody, { photos: [{ originalname: "street.jpg", buffer: JPEG }] });
    expect(report).toMatchObject({ status: "pending", mine: true, reporter: null, lga: { unitName: "Port Harcourt" } });
    expect(repo.created[0]).toMatchObject({ lgaId: portHarcourt.id, wardId: ward.id });
    expect(repo.created[0]!.media).toEqual([{ storage: "database", kind: "photo", mimeType: "image/jpeg", data: JPEG }]);
  });

  it("leaves out a ward that belongs to another LGA than the one containing the point", async () => {
    const { service, repo, units } = reportSetup();
    units.containing = [rivers, okrika, ward];
    await service.submit(user("general_public"), reportBody, {});
    expect(repo.created[0]).toMatchObject({ lgaId: okrika.id, wardId: null });
  });

  it("refuses a file that isn't really a photo, and too many reports in an hour", async () => {
    const { service, repo } = reportSetup();
    await expect(service.submit(user("general_public"), reportBody, { photos: [{ originalname: "x.jpg", buffer: Buffer.from("<html>not an image</html>") }] })).rejects.toBeInstanceOf(ValidationError);
    repo.recent = 10;
    await expect(service.submit(user("general_public"), reportBody, {})).rejects.toBeInstanceOf(AppError);
  });

  it("keeps a pending report from other members of the public, and lets a reviewer in scope publish it", async () => {
    const { service } = reportSetup();
    const report = await service.submit(user("general_public", null, "reporter"), reportBody, {});
    await expect(service.get(report.id, user("general_public", null, "someone-else"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.review(report.id, user("emergency_responder", okrika.id), { decision: "publish", note: null })).rejects.toBeInstanceOf(ForbiddenError);

    const published = await service.review(report.id, user("emergency_responder", portHarcourt.id), { decision: "publish", note: null });
    expect(published).toMatchObject({ status: "published", reporter: { name: "Ada Obi" } });
    expect((await service.get(report.id, user("general_public", null, "someone-else"))).status).toBe("published");
    await expect(service.review(report.id, user("administrator"), { decision: "reject", note: "Duplicate" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("editing a report", () => {
  const sender = () => user("general_public", null, "reporter");

  it("lets the sender change a pending report, and finds the LGA and ward again when the position moves", async () => {
    const { service, units } = reportSetup();
    const report = await service.submit(sender(), reportBody, {});
    expect(report.lga?.unitName).toBe("Port Harcourt");

    units.containing = [rivers, okrika];
    const edited = await service.update(report.id, sender(), { lon: 7.1, lat: 4.7, waterDepth: "waist", description: "Water is now up to the waist.", locationName: "Okrika waterside" });
    expect(edited).toMatchObject({ status: "pending", waterDepth: "waist", locationName: "Okrika waterside", point: [7.1, 4.7], lga: { id: okrika.id }, ward: null });
  });

  it("changes only what is sent, and leaves the position alone", async () => {
    const { service } = reportSetup();
    const report = await service.submit(sender(), reportBody, {});
    const edited = await service.update(report.id, sender(), { description: "Cars are turning back at the junction." });
    expect(edited).toMatchObject({ description: "Cars are turning back at the junction.", waterDepth: "knee", point: [7.0, 4.81], lga: { unitName: "Port Harcourt" } });
  });

  it("sends a rejected report back to the review queue, and tells the reviewers again", async () => {
    const seen: string[] = [];
    domainEvents.on("report.submitted", ({ reportId }) => void seen.push(reportId));
    try {
      const { service } = reportSetup();
      const report = await service.submit(sender(), reportBody, {});
      await service.review(report.id, user("emergency_responder", portHarcourt.id), { decision: "reject", note: "Add the street name" });
      const edited = await service.update(report.id, sender(), { locationName: "Aba Road by Garrison Junction" });
      expect(edited).toMatchObject({ status: "pending", reviewNote: null, reviewedAt: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(seen).toEqual([report.id, report.id]);
    } finally {
      domainEvents.clear();
    }
  });

  it("won't edit a published report, or someone else's", async () => {
    const { service } = reportSetup();
    const report = await service.submit(sender(), reportBody, {});
    await expect(service.update(report.id, user("general_public", null, "someone-else"), { description: "I want to change this." })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(report.id, user("administrator"), { description: "A coordinator shouldn't rewrite it." })).rejects.toBeInstanceOf(ForbiddenError);

    await service.review(report.id, user("emergency_responder", portHarcourt.id), { decision: "publish", note: null });
    await expect(service.update(report.id, sender(), { description: "Too late to change this." })).rejects.toBeInstanceOf(ConflictError);
  });

  it("finds nothing to edit for an unknown report", async () => {
    await expect(reportSetup().service.update("nope", sender(), { description: "Something to say here." })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleting a report", () => {
  const sender = () => user("general_public", null, "reporter");

  it("lets the sender delete a report that isn't published, and removes its files from storage", async () => {
    const { service, repo, storage } = reportSetup(true);
    const report = await service.submit(sender(), reportBody, { photos: [{ originalname: "street.jpg", buffer: JPEG }] });
    await service.remove(report.id, sender());
    expect(repo.rows.has(report.id)).toBe(false);
    expect(storage.removed).toEqual(["geoclime/flood-reports/2026-10/file-1"]);
  });

  it("keeps a published report from its sender: only a coordinator may remove it", async () => {
    const { service, repo } = reportSetup();
    const report = await service.submit(sender(), reportBody, {});
    await service.review(report.id, user("emergency_responder", portHarcourt.id), { decision: "publish", note: null });
    await expect(service.remove(report.id, sender())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.remove(report.id, user("general_public", null, "someone-else"))).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.rows.has(report.id)).toBe(true);

    await service.remove(report.id, user("emergency_responder", portHarcourt.id));
    expect(repo.rows.has(report.id)).toBe(false);
  });

  it("lets a coordinator delete any report in their region, and no other", async () => {
    const { service, repo } = reportSetup();
    const report = await service.submit(sender(), reportBody, {});
    await expect(service.remove(report.id, user("emergency_responder", okrika.id))).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.rows.has(report.id)).toBe(true);
    await service.remove(report.id, user("government_official", portHarcourt.id));
    expect(repo.rows.has(report.id)).toBe(false);
  });

  it("hides someone else's private report: it looks like there is none", async () => {
    const { service } = reportSetup();
    const report = await service.submit(sender(), reportBody, {});
    await expect(service.remove(report.id, user("general_public", null, "someone-else"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove("nope", sender())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("tells the sender when a coordinator deletes their report, but not when they delete it themselves", async () => {
    const seen: string[] = [];
    domainEvents.on("report.deleted", ({ byReviewer }) => void seen.push(`byReviewer:${byReviewer}`));
    try {
      const { service } = reportSetup();
      const mine = await service.submit(sender(), reportBody, {});
      await service.remove(mine.id, sender());
      const other = await service.submit(sender(), reportBody, {});
      await service.remove(other.id, user("administrator"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(seen).toEqual(["byReviewer:false", "byReviewer:true"]);
    } finally {
      domainEvents.clear();
    }
  });
});

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(20)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(20)]);

describe("FloodReportService media storage", () => {
  it("refuses a video or document while Cloudinary isn't set up, and says so in the options", async () => {
    const { service } = reportSetup(false);
    await expect(service.submit(user("general_public"), reportBody, { video: [{ originalname: "clip.mp4", buffer: MP4 }] })).rejects.toBeInstanceOf(ValidationError);
    expect(service.options()).toMatchObject({ cloudStorage: false, limits: { video: { enabled: false }, photo: { enabled: true, maxBytes: 2 * 1024 * 1024 } } });
  });

  it("uploads every kind to Cloudinary, records where each file is, and hands out signed links", async () => {
    const { service, repo, storage } = reportSetup(true);
    const report = await service.submit(user("general_public"), reportBody, {
      photos: [{ originalname: "street.jpg", buffer: JPEG }],
      video: [{ originalname: "clip.mp4", buffer: MP4 }],
      files: [{ originalname: "notice.pdf", buffer: PDF }],
    });
    expect(storage.uploads.map((u) => u.resourceType)).toEqual(["image", "video", "raw"]);
    expect(storage.uploads[0]!.folder).toBe("flood-reports/2026-10");
    expect(repo.created[0]!.media.map((m) => [m.storage, m.kind, m.mimeType])).toEqual([
      ["cloudinary", "photo", "image/jpeg"],
      ["cloudinary", "video", "video/mp4"],
      ["cloudinary", "file", "application/pdf"],
    ]);
    expect(report.status).toBe("pending");
  });

  it("removes what was already uploaded when a later upload fails, and reports a 502", async () => {
    const { service, storage, repo } = reportSetup(true);
    const upload = storage.upload.bind(storage);
    let calls = 0;
    storage.upload = async (input) => {
      calls += 1;
      if (calls === 2) throw new Error("network down");
      return upload(input);
    };
    const failure = service.submit(user("general_public"), reportBody, { photos: [{ originalname: "a.jpg", buffer: JPEG }, { originalname: "b.jpg", buffer: JPEG }] });
    await expect(failure).rejects.toMatchObject({ statusCode: 502 });
    expect(storage.removed).toEqual(["geoclime/flood-reports/2026-10/file-1"]);
    expect(repo.created).toHaveLength(0);
  });

  it("refuses, and removes, a video longer than a minute", async () => {
    const { service, storage } = reportSetup(true);
    storage.duration = 95;
    await expect(service.submit(user("general_public"), reportBody, { video: [{ originalname: "long.mp4", buffer: MP4 }] })).rejects.toBeInstanceOf(ValidationError);
    expect(storage.removed).toHaveLength(1);
  });
});

describe("sniffMedia", () => {
  it("names a file by its first bytes, and refuses what it doesn't recognise", () => {
    expect(sniffMedia("photo", JPEG)).toBe("image/jpeg");
    expect(sniffMedia("audio", Buffer.concat([Buffer.from("OggS"), Buffer.alloc(20)]))).toBe("audio/ogg");
    expect(sniffMedia("photo", Buffer.concat([Buffer.from("OggS"), Buffer.alloc(20)]))).toBeNull();
    expect(sniffMedia("audio", Buffer.from("short"))).toBeNull();
  });
});
