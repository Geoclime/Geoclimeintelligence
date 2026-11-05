# Public Landing API: Reads That Need No Sign-In

## What was built

Five read-only endpoints under `/api/v1/public`, for the landing page's visitors who have not signed in. They are the only `/api/v1` routes that skip the token check.

| Endpoint | Returns | Cached |
|---|---|---|
| `GET /api/v1/public/overview` | The states loaded so far (`states`, by name), area counts per level, feature counts per map layer, the rainfall span (`firstMonth`, `lastMonth`, `areaCount`) and every source behind them | 5 min |
| `GET /api/v1/public/outline` | The LGAs (level 2), simplified to about 300 m, plus the bbox of every state | 5 min |
| `GET /api/v1/public/search?q=` | Up to 8 areas (each with its parent's name) and up to 6 communities whose names contain `q` (2 to 60 characters) | 1 min |
| `GET /api/v1/public/areas/:id` | One area, the areas above it (nearest first), and its monthly rainfall | 5 min |
| `GET /api/v1/public/locate?lon=&lat=` | The state, LGA and ward containing a point (404 outside every area) | 1 min |

Every reply uses the usual envelope ([errors-and-responses.md](errors-and-responses.md)). Unknown paths under `/api/v1/public` return 404, not 401.

## How it works

All paths are relative to `server/src/`.

**1. Mounted before auth.** `app.ts` mounts `publicRouter` at `/api/v1/public` *before* `app.use("/api/v1", authMiddleware, ...)`. The router ends with `notFoundHandler`, so a request never falls through to the token check. Auth still runs exactly once for every other route (section 11).

**2. Only reference data leaves.** Areas, map layers and rainfall are shared reference data, not region-owned records ([access-control.md](access-control.md)). So no region check is needed. Even so, the public replies are deliberately narrow:
- Names, counts and centroids only. The outline is simplified (`zoom: 7`).
- Full-detail shapes and the bbox-limited layer GeoJSON stay behind sign-in.
- Sources are trimmed to `id`, `provider`, `datasetName`, `url` and `license`. Notes and who created the source are never included.

**3. A ward borrows its LGA's rainfall.** CHIRPS rainfall is summarised per LGA, so a ward has none of its own. `PublicService.area` walks up the parents and returns the first rainfall series it finds. `rainfall.adminUnit` says whose it is, and the client says so on screen.

**3a. Locate never contradicts itself.** The wards (GRID3 placeholders) and the LGAs (geoBoundaries) come from different sources and don't line up everywhere. On 30 Oct 2026, 28 of 317 wards had their interior point outside the LGA they belong to. If the ward containing a point is filed under a different LGA than the one containing it, `PublicService.locate` leaves the ward out. The answer then names only the state and LGA. The lasting fix is a ward dataset drawn to the same LGA lines.

**3b. Licences are tidied.** Migration `1791700000000-TrimDataSourceLicences` removed a stray trailing comma ("CC BY 4.0,") from stored licences. `createDataSourceSchema` now strips trailing commas and semicolons, so it can't happen again.

**4. Rate limited.** `middleware/rate-limit.middleware.ts` allows 120 requests per minute per IP (fixed window, in memory) and answers `429` with `Retry-After` beyond that. It sets `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` on every reply. The limit is in memory, which suits the single API instance. A second instance would need a shared store. Behind Render's proxy, `TRUST_PROXY_HOPS=1` (set in `render.yaml`) makes `req.ip` the visitor's address. Without it, every visitor would share one limit.

**5. Cached twice.** `PublicService` keeps the overview and outline in memory for 5 minutes, so an import shows up on the landing page within 5 minutes. The controller also sends `Cache-Control: public, max-age=300` (60 s for search and locate). The alert map is the exception: it is `public, no-cache` (browsers must check before reusing it, and the ETag makes that a cheap `304`), because an alert can't wait a minute to appear. The service's own copy of it lasts 5 seconds only, and is dropped the moment an alert or a published report changes (`PublicService.invalidateAlertMap`, called from `common/realtime/realtime-events.ts`, which then tells every connected browser to refresh). The client clears its own copy (`CACHE_KEYS.public`) when an admin promotes an import or loads or clears a map layer.

**6. New repository reads.**
- `AdminUnitRepository.summariseLevels()` counts areas per level, with their sources.
- `RainfallRepository.findCoverage()` gives the span of months that have a value.
- `SettlementPointRepository.searchByName(q, limit)` puts names that start with `q` first, then primary settlements. LIKE wildcards are escaped.

The service depends on narrow interfaces (`IAreaStatistics`, `IRainfallCoverage`, `ICommunitySearch` in `modules/public/public.types.ts`), so the tests use small fakes.

**Tests:**
- `tests/unit/public.service.test.ts`: counts, source trimming, the cache, the outline, search, and the ward-to-LGA rainfall walk.
- `tests/unit/rate-limit.test.ts`: the limit, `Retry-After`, per-client counting and a fresh window.
- `tests/integration/public.test.ts`: no token needed, the 404s, validation, headers, and every other route still returning 401.

## Resources to read

- Express, "Express behind proxies": https://expressjs.com/en/guide/behind-proxies.html
- IETF draft, "RateLimit header fields for HTTP": https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
- MDN, "Cache-Control": https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control

## Explain it like I'm new to this

Most of the API is a members-only building: the door (the auth middleware) checks your pass on every visit. The landing page needs a few things from inside for visitors without a pass. So there's now a small front desk outside that door. It hands out a short list of public facts: how many LGAs there are, a rough outline of the state, which LGA a community is in, and that LGA's rainfall. It never lets anyone past into the building. And because anyone can walk up to it, it counts visits per person and asks anyone over 120 a minute to wait.
