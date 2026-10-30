import { describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/common/access/auth-user";
import { RegionAccess } from "../../src/common/access/region-access";
import { AppError, ConflictError, ForbiddenError, ValidationError } from "../../src/common/errors/app-error";
import { AlertService } from "../../src/modules/alerts/alert.service";
import { alertStatus, type FloodAlertRow, type IAlertRepository, type NewFloodAlert } from "../../src/modules/alerts/alert.types";
import { FloodReportService } from "../../src/modules/flood-reports/flood-report.service";
import type { FloodReportRow, IFloodReportRepository, NewFloodReport, ReviewDecision } from "../../src/modules/flood-reports/flood-report.types";
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
      media: [],
    });
    return id;
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
