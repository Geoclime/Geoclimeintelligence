import { describe, expect, it } from "vitest";
import { RegionAccess, type RegionHierarchy } from "../../src/common/access/region-access";
import { ForbiddenError } from "../../src/common/errors/app-error";
import { asAuthUser, makeUser } from "../fakes";

// Fixture hierarchy (ids only, no real places): state -> lga -> ward.
const STATE = "state";
const LGA = "lga";
const WARD = "ward";
const OTHER_LGA = "other-lga";
const parentOf: Record<string, string | undefined> = { [LGA]: STATE, [WARD]: LGA, [OTHER_LGA]: STATE };

const treeHierarchy: RegionHierarchy = {
  async isDescendantOrSelf(target, ancestor) {
    for (let node: string | undefined = target; node; node = parentOf[node]) {
      if (node === ancestor) return true;
    }
    return false;
  },
  async subtreeIds(root) {
    const ids = [root];
    for (const [child, parent] of Object.entries(parentOf)) if (parent && ids.includes(parent)) ids.push(child);
    return ids;
  },
};

const access = new RegionAccess(treeHierarchy);
const unrestricted = asAuthUser(makeUser({ role: "administrator" }));
const lgaResponder = asAuthUser(makeUser({ role: "emergency_responder", scopeAdminUnitId: LGA }));

describe("RegionAccess.assert", () => {
  it("lets an unrestricted user act anywhere", async () => {
    await expect(access.assert(unrestricted, OTHER_LGA)).resolves.toBeUndefined();
  });

  it("lets a scoped user act on their own unit and its descendants", async () => {
    await expect(access.assert(lgaResponder, LGA)).resolves.toBeUndefined();
    await expect(access.assert(lgaResponder, WARD)).resolves.toBeUndefined();
  });

  it("rejects a scoped user acting outside their region with 403", async () => {
    await expect(access.assert(lgaResponder, OTHER_LGA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(access.assert(lgaResponder, STATE)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("RegionAccess.scope", () => {
  it("leaves an unrestricted user's query unfiltered", async () => {
    const scoped = await access.scope({ page: 1 }, unrestricted);
    expect(scoped.scopeAdminUnitIds).toBeUndefined();
  });

  it("narrows a scoped user's query to their subtree instead of throwing", async () => {
    const scoped = await access.scope({ page: 1 }, lgaResponder);
    expect(scoped).toEqual({ page: 1, scopeAdminUnitIds: [LGA, WARD] });
  });
});

describe("a scope that points at no real area", () => {
  // subtreeIds() of a missing root is empty, so the stale scope matches nothing.
  const emptyHierarchy: RegionHierarchy = {
    isDescendantOrSelf: async () => false,
    subtreeIds: async () => [],
  };
  const staleAccess = new RegionAccess(emptyHierarchy);

  it("fails closed for single records and lists", async () => {
    await expect(staleAccess.assert(lgaResponder, LGA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(staleAccess.scope({ page: 1 }, lgaResponder)).resolves.toEqual({ page: 1, scopeAdminUnitIds: [] });
  });
});
