import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePendingRoleRequest, takePendingRoleRequest } from "./pending-role-request";

const request = { role: "researcher" as const, reason: "Flood research at UNIPORT.", organisation: "University of Port Harcourt" };

/** A minimal in-memory localStorage, since unit tests run without a browser. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "window", { value: { localStorage: memoryStorage() }, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("pending role request", () => {
  it("is handed back once, to the same email in any letter case", () => {
    savePendingRoleRequest("Ada@Example.com", request, 0);
    expect(takePendingRoleRequest("ada@example.com", 1_000)).toEqual(request);
    expect(takePendingRoleRequest("ada@example.com", 1_000)).toBeNull();
  });

  it("is kept from another account signing in on the same browser", () => {
    savePendingRoleRequest("ada@example.com", request, 0);
    expect(takePendingRoleRequest("someone@example.com", 1_000)).toBeNull();
    expect(takePendingRoleRequest("ada@example.com", 1_000)).toEqual(request);
  });

  it("expires after 30 days", () => {
    savePendingRoleRequest("ada@example.com", request, 0);
    expect(takePendingRoleRequest("ada@example.com", 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
