// Builders for stubbed Phase 2 payloads, shaped exactly like the backend's DTOs (see
// server/src/modules/admin-units and data-sources). They only feed cy.intercept(); the app never
// renders invented data (rule 19.4). Shapes are small squares, not real boundaries.
import { stubId } from "./factories";

type BBox = [number, number, number, number];

export interface StubUnit {
  id: string;
  countryCode: string;
  level: number;
  levelName: string;
  unitName: string;
  unitCode: string | null;
  parentId: string | null;
  sourceId: string;
  childCount: number;
  bbox: BBox;
  centroid: [number, number];
}

export const SOURCE_ID = stubId(700);

export function square([lon, lat]: [number, number], size = 0.05) {
  return {
    type: "MultiPolygon" as const,
    coordinates: [[[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]]],
  };
}

export function buildUnit(n: number, overrides: Partial<StubUnit> = {}): StubUnit {
  const lon = 6.5 + (n % 10) * 0.08;
  const lat = 4.5 + Math.floor(n / 10) * 0.08;
  return {
    id: stubId(n),
    countryCode: "NGA",
    level: 2,
    levelName: "LGA",
    unitName: `Area ${n}`,
    unitCode: `CODE${n}`,
    parentId: stubId(100),
    sourceId: SOURCE_ID,
    childCount: 0,
    bbox: [lon, lat, lon + 0.05, lat + 0.05],
    centroid: [lon + 0.025, lat + 0.025],
    ...overrides,
  };
}

export const STATE = buildUnit(100, { level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI", parentId: null, childCount: 2, bbox: [6.4, 4.3, 7.6, 5.7], centroid: [6.95, 4.95] });
export const PORT_HARCOURT = buildUnit(101, { unitName: "Port Harcourt", unitCode: "NG033022", childCount: 2 });
export const OBIO_AKPOR = buildUnit(102, { unitName: "Obio-Akpor", unitCode: "NG033015", childCount: 1 });
export const WARD = buildUnit(201, { level: 3, levelName: "Ward", unitName: "Phward 17", unitCode: "RVSPHC17", parentId: PORT_HARCOURT.id });

export const SOURCE = {
  id: SOURCE_ID,
  provider: "geoBoundaries (William & Mary geoLab)",
  datasetName: "gbOpen NGA ADM2",
  url: "https://www.geoboundaries.org",
  license: "CC BY 4.0",
  downloadedOn: "2026-09-22",
  notes: null,
  createdAt: "2026-10-05T10:00:00.000Z",
};

export function detail(unit: StubUnit, parent: StubUnit | null = null) {
  const { id, countryCode, level, levelName, unitName, unitCode } = parent ?? unit;
  return {
    ...unit,
    parent: parent ? { id, countryCode, level, levelName, unitName, unitCode } : null,
    source: SOURCE,
    geometry: square([unit.bbox[0], unit.bbox[1]]),
  };
}

export function featureCollection(units: StubUnit[]) {
  return {
    type: "FeatureCollection",
    features: units.map((u) => ({
      type: "Feature",
      id: u.id,
      geometry: square([u.bbox[0], u.bbox[1]]),
      properties: { id: u.id, unitName: u.unitName, unitCode: u.unitCode, level: u.level, levelName: u.levelName, parentId: u.parentId, sourceId: u.sourceId },
    })),
  };
}

export function buildCountry(unitCounts: [number, number, number] = [1, 23, 317]) {
  return {
    countryCode: "NGA",
    countryName: "Nigeria",
    levels: ["State", "LGA", "Ward"].map((name, i) => ({ level: i + 1, name, unitCount: unitCounts[i] })),
    bbox: [2.5, 4, 14.8, 14] as BBox,
    createdAt: "2026-10-05T10:00:00.000Z",
    updatedAt: "2026-10-05T10:00:00.000Z",
  };
}

export function buildRun(overrides: Record<string, unknown> = {}) {
  return {
    id: stubId(800),
    target: "admin_units",
    fileName: "rivers_state_wards.geojson",
    fileType: "geojson",
    sheetName: null,
    options: { countryCode: "NGA", level: 3, levelName: "Ward", parentId: null },
    columnMapping: { unit_name: "wardname", unit_code: "wardcode", parent_code: "lganame" },
    source: { id: SOURCE_ID, provider: "GRID3", datasetName: "Operational Wards v1.0" },
    status: "checked",
    rowCount: 318,
    passedCount: 317,
    errorCount: 1,
    promotedCount: null,
    warnings: [],
    extent: [6.4, 4.3, 7.6, 5.7] as BBox,
    createdBy: { id: stubId(9000), email: "administrator@example.com", displayName: "Ada Admin" },
    createdAt: "2026-10-05T10:00:00.000Z",
    promotedBy: null,
    promotedAt: null,
    ...overrides,
  };
}

export function buildStagingRow(rowNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    id: stubId(5000 + rowNumber),
    rowNumber,
    status: "passed",
    unitName: `Ward ${rowNumber}`,
    unitCode: `RVS${rowNumber}`,
    parentRef: "Obio/Akpor",
    parentName: "Obio-Akpor",
    hasShape: true,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

/** Stubs the reads the home map makes, with Rivers State, two LGAs and one ward loaded. */
export function stubGeography() {
  const list = (level: string, data: StubUnit[]) =>
    cy.interceptApi("GET", "/admin-units?*", { data, meta: { page: 1, pageSize: 100, total: data.length } }, { query: { level } });
  const layer = (level: string, data: StubUnit[]) =>
    cy.interceptApi("GET", "/admin-units/geojson?*", { data: featureCollection(data) }, { query: { level } });

  cy.interceptApi("GET", "/countries", { data: [buildCountry()] }).as("getCountries");
  list("1", [STATE]).as("getStates");
  list("2", [OBIO_AKPOR, PORT_HARCOURT]).as("getLgas");
  layer("1", [STATE]).as("stateLayer");
  layer("2", [OBIO_AKPOR, PORT_HARCOURT]).as("lgaLayer");
  layer("3", [WARD]).as("wardLayer");
}
