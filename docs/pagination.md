# Pagination

## What was built

Shared helpers that let any list endpoint return its results a page at a time instead of all at once. Two styles are supported. **Offset** pagination ("page 3 of 25-per-page") is for small admin lists. **Cursor** pagination ("the next 25 after this one") is for large, fast-growing lists such as disaster events and rainfall readings. That matters because this platform will hold years of observations, and sending them all in one response would be slow and could crash a phone's browser.

## How it works

All paths are relative to `server/`.

**1. Offset pagination: `?page=2&pageSize=25`.** [`src/common/pagination/pagination.ts`](../server/src/common/pagination/pagination.ts) defines `offsetPageQuerySchema`:
- `page` defaults to 1.
- `pageSize` defaults to 25 and is capped at 100 (`MAX_PAGE_SIZE`), so nobody can ask for a million rows.
- Query strings are always text, so Zod converts `"2"` into the number `2`.

`BaseRepository.findPage` in [`src/common/repository/base.repository.ts`](../server/src/common/repository/base.repository.ts) turns that into `skip (page-1)*pageSize, take pageSize`. It also counts the total, so the response `meta` is `{ page, pageSize, total }`.

**In use now:** `GET /api/v1/users` (see [user-management.md](user-management.md)). [`user.repository.ts`](../server/src/modules/users/user.repository.ts) always sorts by `createdAt` then `id`, so pages come out in a stable order.

**2. Cursor pagination: `?cursor=<opaque>&limit=25`.** Offset paging has a flaw on tables that are constantly being written to. If ten new rainfall readings arrive while you're on page 1, page 2 starts ten rows later than it should, and you see some rows twice or miss some. Cursor pagination says "give me the rows that come *after this exact row*" instead:
- `BaseRepository.findCursorPage` sorts newest first by an indexed column (such as `eventDate`), using `id` as a tie-breaker. It asks the database for `limit + 1` rows. If that extra row comes back, there's another page.
- The position of the last row returned is packed into `meta.nextCursor`: `encodeCursor` turns `{ value, id }` into JSON and then into base64url, a URL-safe text encoding. The client sends it back unchanged as `?cursor=...`. If there's no `nextCursor`, that was the last page.
- The next query adds `WHERE (orderBy, id) < (lastValue, lastId)`. PostgreSQL compares both values together as a pair, and the index takes it straight there without counting through earlier rows.
- A cursor that has been edited or is corrupted doesn't break the query. `decodeCursor` checks it and answers `400 Invalid pagination cursor`.

**In use now:** nothing yet. It's ready for the first large list in Phase 4 (disaster events) and Phase 5 (rainfall observations). [`tests/unit/pagination.test.ts`](../server/tests/unit/pagination.test.ts) covers the cursor round-trip, rejecting a tampered cursor, and the defaults and cap for offset paging.

**A rule for later phases** (standard section 10): list endpoints must never return full map shapes. That would make a 25-row page several megabytes. Lists return no geometry or only a bounding box and centre point; the detail endpoint returns the full shape of one record.

## Resources to read

- Why cursor/keyset pagination beats OFFSET on big tables: https://use-the-index-luke.com/no-offset
- PostgreSQL `LIMIT` and `OFFSET`: https://www.postgresql.org/docs/current/queries-limit.html
- Comparing two values as a pair (row comparison): https://www.postgresql.org/docs/current/functions-comparisons.html#ROW-WISE-COMPARISON
- Base64url encoding (RFC 4648, section 5): https://datatracker.ietf.org/doc/html/rfc4648#section-5

## Explain it like I'm new to this

Offset pagination is like saying "show me page 3 of the phone book". That works fine for a book that never changes. But if someone slips new pages in at the front while you're reading, "page 3" now shows different names, and you might read some twice. Cursor pagination is like keeping your finger on the last name you read and asking "show me the next 25 names after *this* one". New pages added at the front don't move your finger. The cursor is just a note of where your finger is, written in a compact form so it fits in a web address. If someone scribbles on that note, the API notices and says so rather than guessing.
