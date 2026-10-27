import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { readCsv } from "../../src/modules/data-sources/imports/readers/csv-reader";
import { detectFileType } from "../../src/modules/data-sources/imports/readers/read-import-file";

function fileMessage(read: () => unknown): string {
  try {
    read();
  } catch (err) {
    return (err as ValidationError).errors?.[0]?.message ?? "";
  }
  return "(no error)";
}

const WKT = "POLYGON((7 4.8, 7.01 4.8, 7.01 4.81, 7 4.81, 7 4.8))";

describe("readCsv", () => {
  it("reads headings and rows as text, keeping a quoted WKT shape (full of commas) in one cell", () => {
    const csv = `unit_name,unit_code,geometry_wkt\r\nOkrika,NG033018,"${WKT}"\r\nBonny,,"${WKT}"\r\n`;
    const parsed = readCsv(Buffer.from(csv));
    expect(parsed).toMatchObject({ fileType: "csv", sheets: [], headerRow: 1, headings: ["unit_name", "unit_code", "geometry_wkt"], warnings: [] });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 2, geometry: null, values: { unit_name: "Okrika", unit_code: "NG033018", geometry_wkt: WKT } });
    expect(parsed.rows[1]!.values.unit_code).toBeNull();
  });

  it("works out semicolon and tab delimiters, and ignores a byte-order mark", () => {
    expect(readCsv(Buffer.from("name;code\nOkrika;NG033018")).rows[0]!.values).toEqual({ name: "Okrika", code: "NG033018" });
    expect(readCsv(Buffer.from("name\tcode\nOkrika\tNG033018")).rows[0]!.values).toEqual({ name: "Okrika", code: "NG033018" });
    expect(readCsv(Buffer.from("﻿name,code\nOkrika,NG033018")).headings).toEqual(["name", "code"]);
  });

  it("skips blank rows, ignores columns with no heading, and makes repeated headings unique", () => {
    const parsed = readCsv(Buffer.from("name,,name\nOkrika,x,Port\n\n,,\nBonny,y,Harcourt\n"));
    expect(parsed.headings).toEqual(["name", "name (2)"]);
    expect(parsed.rows.map((r) => r.values)).toEqual([
      { name: "Okrika", "name (2)": "Port" },
      { name: "Bonny", "name (2)": "Harcourt" },
    ]);
  });

  it("reads Windows Latin-1 text when the bytes aren't valid UTF-8", () => {
    expect(readCsv(Buffer.from("name\nÑandú", "latin1")).rows[0]!.values.name).toBe("Ñandú");
  });

  it("copes with short and long rows", () => {
    const parsed = readCsv(Buffer.from("a,b,c\n1\n1,2,3,4"));
    expect(parsed.rows.map((r) => r.values)).toEqual([
      { a: "1", b: null, c: null },
      { a: "1", b: "2", c: "3" },
    ]);
  });

  it("refuses an empty file and one with no headings", () => {
    expect(fileMessage(() => readCsv(Buffer.from("")))).toMatch(/empty/);
    expect(fileMessage(() => readCsv(Buffer.from(",,\n1,2,3")))).toMatch(/no headings/);
  });
});

describe("detectFileType for CSV", () => {
  it("goes by extension, and takes a .txt of plain text", () => {
    expect(detectFileType({ originalName: "rain.csv", buffer: Buffer.from("a,b") })).toBe("csv");
    expect(detectFileType({ originalName: "rain.TSV", buffer: Buffer.from("a\tb") })).toBe("csv");
    expect(detectFileType({ originalName: "rain.txt", buffer: Buffer.from("a,b\n1,2") })).toBe("csv");
    expect(() => detectFileType({ originalName: "rain.txt", buffer: Buffer.from([0, 1, 2, 0]) })).toThrow(ValidationError);
  });
});
