# The Database's Connection Limit

## What was built

A cap on how many database connections one copy of the API may hold open, set by a new setting, `DATABASE_POOL_MAX` (default `5`).

It was added because a Render deploy failed at startup with `remaining connection slots are reserved for roles with the SUPERUSER attribute` (Postgres error `53300`, "too many connections"). The migration step, `npm run migration:run`, could not connect at all, so the new version never started.

The numbers, read from the database itself (`max_connections` and `superuser_reserved_connections`):

- the Aiven database allows **20** connections;
- **3** are reserved for the provider's own admin tools;
- so **17** are usable by us.

Before the cap, each process that used the database could open **10** connections (node-postgres' default) and, since the "keep connections for five minutes" change in [database-connection-ssl.md](database-connection-ssl.md), hold them for five minutes after a burst. Render's running API, a laptop's `npm run dev`, and the migration step all share the same database. Two busy processes were enough to use all 17 slots, and the third was refused. The map asks for about eight layers at once, which is exactly the burst that fills a pool.

## How it works

All paths are relative to `server/`.

1. [`src/config/env.ts`](../server/src/config/env.ts) reads `DATABASE_POOL_MAX`: a whole number from 1 to 20, default 5.
2. [`src/config/data-source.ts`](../server/src/config/data-source.ts) passes it to TypeORM as `poolSize`, which node-postgres uses as the pool's `max`. When all of a process's connections are busy, the next query waits for one to free up (for up to the existing 15-second `connectionTimeoutMillis`) instead of opening another.
3. Nothing else changes: the five-minute keep-alive, the TLS settings and every query are as they were.

The budget at the default of 5: Render 5, a laptop 5, and the migration or a script a little more, which fits inside 17 with room to spare. During a deploy Render briefly runs the old and new versions together, so they overlap. To change it, set `DATABASE_POOL_MAX` in `.env` or the Render dashboard. [`.env.example`](../server/.env.example) shows the setting.

**If the error comes back**
- Stop the local server (`npm run dev`) while Render deploys: that frees up to 5 slots straight away.
- Look at who holds the connections. Run this in any SQL client on the database: `SELECT client_addr, state, count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' GROUP BY 1, 2;`. Render's address and your own are the usual two.
- The lasting fix is the one [deployment-render.md](deployment-render.md) already recommends: a separate database for production, so a laptop can never take a slot from Render.

**What was and wasn't checked.** The limits and the connection count were read from the live database. The typecheck passes. The change was not tested against a deploy; the first Render build after it is the real check.

## Resources to read

- PostgreSQL `max_connections` and the superuser-reserved slots: https://www.postgresql.org/docs/current/runtime-config-connection.html
- node-postgres pool options (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`): https://node-postgres.com/apis/pool
- TypeORM's PostgreSQL connection options (`poolSize`): https://typeorm.io/data-source-options#postgres--cockroachdb-data-source-options
- [database-connection-ssl.md](database-connection-ssl.md): why connections are kept for five minutes.

## Explain it like I'm new to this

The database is a small restaurant with 20 chairs, and 3 are always held for the owner. That leaves 17 for customers. Each of our programs (the live website, the laptop you test on, the tool that sets up the tables at startup) used to send its whole party of up to 10 and let them sit for five minutes. Two big parties took every chair, and the third group, the one that had to set the table before opening, was turned away at the door. Now each party is limited to 5 people. Everyone fits, and if a party is bigger than its seats, the extras wait a moment for someone to stand up instead of pushing in.
