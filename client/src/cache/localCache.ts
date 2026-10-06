/**
 * In-memory, TTL-based cache for stable reference data that many screens reuse (standard
 * section 14): the country list, the LGA directory, an area's details. It sits between hooks and
 * endpoints. Rules:
 *   - invalidate explicitly when a write touches the resource (invalidateCached), never rely on
 *     expiry alone;
 *   - never cache a bbox-keyed map layer: the viewport changes constantly, so the cache would
 *     grow without bound and almost never hit;
 *   - memory only: nothing is written to localStorage or IndexedDB, and a reload starts empty.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** 15 minutes: the low end of the standard's 15-30 minute guidance for reference data. */
export const REFERENCE_TTL_MS = 15 * 60 * 1000;

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number = REFERENCE_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCached(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Returns the cached value for `key`, or loads, caches and returns it. */
export async function cached<T>(key: string, load: () => Promise<T>, ttlMs?: number): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== undefined) return hit;
  const value = await load();
  setCached(key, value, ttlMs);
  return value;
}

/** Cache key prefixes, so a write can invalidate everything that depends on it. */
export const CACHE_KEYS = {
  countries: "countries:",
  adminUnits: "admin-units:",
} as const;
