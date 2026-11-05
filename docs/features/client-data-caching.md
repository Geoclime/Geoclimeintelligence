# Client Data Caching (TanStack Query)

## What was built

Screens used to ask the server again every time they opened: going back to a tab you had just left, or to a page you had just visited, showed a spinner and sent the same request again. The app now remembers what it has already asked, using **TanStack Query** (`@tanstack/react-query`).

What you notice:
- **Opening something again is instant.** The last answer shows at once, with no spinner.
- **Nothing is asked while an answer is fresh.** After that, the old answer stays on screen and the app re-asks behind it, swapping in the new one when it arrives.
- **Two parts of a page asking for the same thing share one request.**
- **Changing something clears what it touches.** Publishing a report, issuing an alert or changing a user refreshes the lists that depend on it.
- **Signing out forgets everything,** so the next person to sign in on the same device never sees the last one's data.

Measured on the offline test build while moving between the review-queue tabs and the Alerts and Notifications pages: **24 server calls before, 7 after.** Going back to a tab or page inside its freshness window sends none.

How long each kind of data is trusted (`cache/queryClient.ts`):

| Policy | Fresh for | Kept for | Used by |
|---|---|---|---|
| Reference | 15 min | 60 min | Countries, area lists and details, the map layer list, rainfall series, the public overview, outline and areas, the report form's media limits |
| Alerts | 10 s | 5 min | The public alert map (landing page, Alerts page): refreshed at once by a live signal, with a one-minute re-ask as a safety net |
| Live | 30 s | 5 min | Alerts for signed-in users, the review queue, "my reports", the notification inbox, the admin user list |
| Settings | 5 min | 30 min | A person's notification settings, data sources |
| None | never remembered | closed screen forgets it | Import progress, the import preview map, place search |

**Never cached:** map layers for the visible area (`useMapLayer`, `useAdminUnitLayer`): the viewport changes with every pan, so an entry would almost never be used again. The "Where am I?" lookup isn't cached either.

## How it works

All paths are relative to `client/src/`.

**1. One client.** [`cache/queryClient.ts`](../../client/src/cache/queryClient.ts) creates the `QueryClient` and the three policies, and `App.tsx` wraps the app in `QueryClientProvider`. It keeps answers **in memory only**: nothing is written to localStorage or IndexedDB, and a reload starts empty (standard section 14).

**2. Hooks keep their contract.** Screens never talk to TanStack directly. [`hooks/useLoader.ts`](../../client/src/hooks/useLoader.ts) is a thin layer over `useQuery` that returns the same `data`, `loading`, `error`, `errorStatus`, `refetch` and `setData` the feature hooks always had, so no screen changed. It adds `refreshing` (an older answer is on screen while a newer one loads). Its rules:
- `loading` is true only when there is nothing to show: no answer yet, or the answer for a new page or tab is on its way while the previous one stays on screen.
- A re-fetch that fails behind an answer already on screen keeps that answer, rather than replacing it with an error.
- With no policy, nothing is remembered once the screen closes, and every open asks the server.

**3. Query keys say what the answer depends on.** Each key is an array whose first part is a root in `QUERY_KEYS`, followed by the things that change the answer: `["reports", "published", 1, 20]` (status, page, page size), `["admin-units", "children", id, 1, 100]`. Two screens that build the same key share one answer. A key must include everything the answer depends on, and nothing it doesn't.

**4. Writes invalidate by root.** `invalidateQueries(QUERY_KEYS.reports)` marks every answer under that root stale and re-asks the ones on screen. It can leave one key alone, for a screen that has just updated it in place:

| When | Cleared |
|---|---|
| A flood report is sent | review queue, the sender's own list |
| A report is reviewed | the other review tabs, own lists, alerts and the public alert map; the tab you are on is updated in place, so a report you just published stays on screen as *Published* instead of vanishing |
| An alert is issued or ended | the alert lists and the public alert map |
| A notification arrives, or is read | the inbox |
| An account's access changes | the other user-list pages |
| A country is saved, deleted or cleared; an import is promoted | countries, areas, rainfall, the public overview |
| A map layer is uploaded or cleared | the layer list and the public overview |

**Live signals.** `LiveUpdates` (mounted once in `App.tsx`) listens on the Socket.IO connection, which every visitor has, signed in or not. A signal such as `alerts:changed` marks the matching data stale with `invalidateQueries`, and whatever is on screen asks the REST API again at once. So an alert issued by an official shows on an open landing page without a refresh, and a new report appears in the review queue the moment it is sent. The signals and what they refresh are listed in [notifications.md](../notifications.md), "Live updates".

**5. Retries.** A dropped connection, a timeout or a server fault is tried again, twice at most. A 4xx is the server's answer and is never retried. The offline test build never retries, so a spec that stubs a failure sees it at once.

**6. Window focus.** Remembered data that has gone stale is re-asked when you come back to the tab. Hooks with no policy aren't.

**Adding a read hook:** call `useLoader(key, loader, POLICY)` with an array key and the policy that fits how fast the data changes. Anything a write changes needs an `invalidateQueries` call in the hook that writes. Tests are in [`cache/queryClient.test.ts`](../../client/src/cache/queryClient.test.ts) (invalidation, clearing, which failures are retried, the policies).

## Resources to read

- TanStack Query, "Important Defaults": https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- TanStack Query, "Query Invalidation": https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
- TanStack Query, "Paginated / Lagged Queries" (keeping the previous page on screen): https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries
- HTTP `stale-while-revalidate`, the idea it is named after: https://web.dev/articles/stale-while-revalidate

## Explain it like I'm new to this

Think of a shop assistant who keeps a notepad. The first time you ask "what's the price of rice?", they go to the stockroom and check, then write the answer on the notepad. Ask again a minute later and they read it off the notepad, so there's no waiting. Once the note is old enough that the price might have changed, they still tell you the number on the notepad straight away, and quietly check the stockroom while you look at it, then correct it if it changed. If two people ask at the same time, one trip to the stockroom covers both. When the shop changes a price, the assistant crosses out every note that depended on it, and when the shift ends the whole notepad is thrown away, so the next assistant never reads the last one's notes.
