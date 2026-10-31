import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "../transport/api-error";
import { ALERTS_POLICY, clearQueries, invalidateQueries, LIVE_POLICY, queryClient, QUERY_KEYS, REFERENCE_POLICY, SETTINGS_POLICY } from "./queryClient";

afterEach(() => clearQueries());

const invalidated = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;

describe("invalidateQueries", () => {
  it("marks every answer under a root stale, and nothing else", () => {
    queryClient.setQueryData([...QUERY_KEYS.reports, "pending", 1, 20], ["a"]);
    queryClient.setQueryData([...QUERY_KEYS.reports, "published", 1, 20], ["b"]);
    queryClient.setQueryData([...QUERY_KEYS.alerts, "recent"], ["c"]);

    invalidateQueries(QUERY_KEYS.reports);

    expect(invalidated([...QUERY_KEYS.reports, "pending", 1, 20])).toBe(true);
    expect(invalidated([...QUERY_KEYS.reports, "published", 1, 20])).toBe(true);
    expect(invalidated([...QUERY_KEYS.alerts, "recent"])).toBe(false);
  });

  it("leaves one key alone, for a screen that has just updated it in place", () => {
    const current = [...QUERY_KEYS.reports, "pending", 1, 20];
    queryClient.setQueryData(current, ["a"]);
    queryClient.setQueryData([...QUERY_KEYS.reports, "published", 1, 20], ["b"]);

    invalidateQueries(QUERY_KEYS.reports, current);

    expect(invalidated(current)).toBe(false);
    expect(invalidated([...QUERY_KEYS.reports, "published", 1, 20])).toBe(true);
  });
});

describe("clearQueries", () => {
  it("forgets everything, so the next person to sign in sees nothing of the last", () => {
    queryClient.setQueryData([...QUERY_KEYS.notifications, 1, 20, false], ["private"]);
    queryClient.setQueryData([...QUERY_KEYS.users, 1], ["private"]);

    clearQueries();

    expect(queryClient.getQueryData([...QUERY_KEYS.notifications, 1, 20, false])).toBeUndefined();
    expect(queryClient.getQueryData([...QUERY_KEYS.users, 1])).toBeUndefined();
  });
});

describe("what is worth asking again", () => {
  const retry = queryClient.getDefaultOptions().queries?.retry as (failureCount: number, error: unknown) => boolean;

  it("retries a dropped connection, a timeout or a server fault, twice at most", () => {
    expect(retry(0, new ApiError("x", "network"))).toBe(true);
    expect(retry(1, new ApiError("x", "timeout"))).toBe(true);
    expect(retry(0, new ApiError("x", "http", 503))).toBe(true);
    expect(retry(2, new ApiError("x", "network"))).toBe(false);
  });

  it("never retries the server's own answer", () => {
    for (const status of [400, 401, 403, 404, 409]) expect(retry(0, new ApiError("x", "http", status))).toBe(false);
  });
});

describe("the freshness policies", () => {
  it("keep an answer longer than they trust it, and trust slower-changing data longer", () => {
    for (const policy of [REFERENCE_POLICY, LIVE_POLICY, ALERTS_POLICY, SETTINGS_POLICY]) expect(policy.gcMs).toBeGreaterThan(policy.staleMs);
    // The public alert map is trusted for the least: a severe alert has to show within seconds.
    expect(ALERTS_POLICY.staleMs).toBeLessThan(LIVE_POLICY.staleMs);
    expect(LIVE_POLICY.staleMs).toBeLessThan(SETTINGS_POLICY.staleMs);
    expect(SETTINGS_POLICY.staleMs).toBeLessThan(REFERENCE_POLICY.staleMs);
  });
});
