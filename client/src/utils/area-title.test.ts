import { describe, expect, it } from "vitest";
import { areaTitle, listAreas } from "./area-title";

describe("areaTitle", () => {
  it("adds the level unless the name already ends with it", () => {
    expect(areaTitle("Rivers", "State")).toBe("Rivers State");
    expect(areaTitle("Federal Capital Territory", "Territory")).toBe("Federal Capital Territory");
    expect(areaTitle("Rivers state", "State")).toBe("Rivers state");
  });
});

describe("listAreas", () => {
  it("reads naturally for one, two or more names", () => {
    expect(listAreas([])).toBe("");
    expect(listAreas(["Rivers State"])).toBe("Rivers State");
    expect(listAreas(["Rivers State", "Lagos State"])).toBe("Rivers State and Lagos State");
    expect(listAreas(["Rivers State", "Lagos State", "Bayelsa State"])).toBe("Rivers State, Lagos State and Bayelsa State");
  });
});
