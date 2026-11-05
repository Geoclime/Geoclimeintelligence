import { describe, expect, it } from "vitest";
import { googleMapsUrl } from "./google-maps";

describe("googleMapsUrl", () => {
  it("writes latitude before longitude, though the app holds points as [longitude, latitude]", () => {
    expect(googleMapsUrl([7.0679, 4.8289])).toBe("https://www.google.com/maps/search/?api=1&query=4.8289,7.0679");
  });

  it("keeps the sign of a southern or western point", () => {
    expect(googleMapsUrl([-58.38, -34.6])).toBe("https://www.google.com/maps/search/?api=1&query=-34.6,-58.38");
  });
});
