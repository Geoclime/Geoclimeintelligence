# Database Connection over SSL

## What was built

The backend can now connect to a PostgreSQL database hosted in the cloud (we use **Aiven**) over an encrypted connection, and it checks that it is talking to the real server. **SSL/TLS** is the encryption that also protects `https://` websites. Before this change the API could only reach a database on your own machine: Aiven rejects unencrypted connections, and Node.js did not trust the certificate Aiven presents.

## How it works

All paths are relative to `server/`. A database connection is configured in this order.

1. **Settings live in `.env`**, which is never committed (see [`.gitignore`](../server/.gitignore)). [`.env.example`](../server/.env.example) lists three database settings:
   - `DATABASE_URL`: where the database is, plus the username and password, in the form `postgres://user:password@host:port/database`.
   - `DATABASE_SSL`: `true` to encrypt the connection, `false` for a local database without SSL.
   - `DATABASE_SSL_CA`: an optional path to the database provider's **CA certificate**, for example `certs/aiven-ca.pem`. A CA (certificate authority) certificate is what lets us check that the server's certificate is genuine.
2. **The certificate file lives in `server/certs/`**, which is also in `.gitignore`. For Aiven, download it from the Aiven console: open the service, go to **Overview**, and download **CA certificate**. Every Aiven project has its own CA, so each developer downloads the one for the project they connect to.
3. **[`src/config/env.ts`](../server/src/config/env.ts) checks the settings** when the app starts, using a Zod schema. `DATABASE_SSL` becomes a real `true`/`false`, and `DATABASE_SSL_CA` is optional. If a required setting is missing, the app stops at startup and lists what's wrong, rather than failing later in some unrelated place.
4. **[`src/config/data-source.ts`](../server/src/config/data-source.ts) builds the connection.** This is the only place the app's database connection (`AppDataSource`) is created. It does two things:
   - **`withoutSslParams`** removes any SSL settings from the URL, such as `?sslmode=require`, which Aiven's copy-paste connection string includes. The database driver, `pg`, lets SSL settings in the URL completely replace the SSL settings the code passes in. You can see this in `node_modules/pg/lib/connection-parameters.js`: the parsed URL is merged *over* the config. So before this change, `DATABASE_SSL` was silently ignored whenever the URL had `sslmode` in it. Removing those parameters means `.env` controls SSL in one place only.
   - **The `ssl` option**: when `DATABASE_SSL=true`, the code sets `rejectUnauthorized: true`, meaning "refuse the connection unless the certificate checks out". If `DATABASE_SSL_CA` is set, it also reads that file and passes it as `ca`, meaning "trust certificates signed by this CA". Node also checks that the certificate belongs to the host named in the URL.
5. **Three places use `AppDataSource`**, so all three get the same SSL behaviour:
   - [`src/server.ts`](../server/src/server.ts) connects to it when the API starts. The log line `Database connected` means it worked.
   - The TypeORM command-line tool behind `npm run migration:run`, `migration:show` and `migration:revert`.
   - [`src/scripts/set-user-access.ts`](../server/src/scripts/set-user-access.ts), which sets up the first administrator.

**We did not turn off certificate checking.** The quick fix you'll often see online is `rejectUnauthorized: false`. That keeps the connection encrypted but stops checking *who* is on the other end, so an attacker in the middle could pretend to be the database and read every query, passwords included. Giving Node the right CA certificate fixes the error while keeping that check.

**Setting up a new machine against Aiven:**

```bash
cd server
cp .env.example .env
# In .env: paste Aiven's Service URI into DATABASE_URL, then set
#   DATABASE_SSL=true
#   DATABASE_SSL_CA=certs/aiven-ca.pem
# Save the CA certificate from the Aiven console as server/certs/aiven-ca.pem
npm run migration:show      # connection check: lists migrations, [ ] = not yet run
npm run migration:run       # creates the tables
npm run dev                 # log should say "Database connected"
```

For a local PostgreSQL without SSL, set `DATABASE_SSL=false` and leave `DATABASE_SSL_CA` empty.

**What the errors mean:**

| Error | Cause | Fix |
|---|---|---|
| `self-signed certificate in certificate chain` | Node doesn't trust the server's CA | Set `DATABASE_SSL_CA` to the provider's CA certificate |
| `ENOENT: no such file or directory` (at startup) | `DATABASE_SSL_CA` points to a file that isn't there | Check the path, which is relative to `server/` |
| `ENOENT: no such file or directory, open 'certs/aiven-ca.pem'` (during `npm test` / a build) | `data-source.ts` reads `DATABASE_SSL_CA` off disk as soon as it's imported, before any test runs. Away from the machine that has `server/certs/aiven-ca.pem` (CI, Render's build step, a different working directory) that relative path resolves to nothing | Should not happen: [`vitest.config.mts`](../server/vitest.config.mts) pins `DATABASE_SSL=false` for the whole test run for exactly this reason (see [testing.md](testing.md)). If you see this in tests, check that override wasn't removed |
| `The server does not support SSL connections` | `DATABASE_SSL=true` against a local database with no SSL | Set `DATABASE_SSL=false` |
| `no pg_hba.conf entry ... no encryption` / connection reset | `DATABASE_SSL=false` against a server that requires SSL (Aiven always does) | Set `DATABASE_SSL=true` |

**Tests:** the existing tests use in-memory fakes and never open a real database connection, so this change was checked by hand against the Aiven database. `migration:show` failed with the certificate error before the change and succeeded after it. The Phase 1 migration then ran, and `GET /health` answered `200`.

**Flagged for the team (NEEDS VERIFICATION):**
- The `DATABASE_URL` currently points at Aiven's `defaultdb` database. Decide whether the platform should have its own database, such as `climate_platform`, and a login with fewer privileges than the Aiven admin user `avnadmin`.
- In staging and production, the CA certificate has to reach the server by some other route, such as a secret mounted as a file. That's the Cloud Engineer's call (section 18 of the Architecture doc).
- If Aiven ever rotates the project CA, everyone must download the new certificate.

## Resources to read

- node-postgres SSL options (the `ssl` object we pass): https://node-postgres.com/features/ssl
- PostgreSQL's SSL modes (`sslmode=require`, `verify-full`, and so on): https://www.postgresql.org/docs/current/libpq-ssl.html
- Node.js TLS (what `ca` and `rejectUnauthorized` mean underneath): https://nodejs.org/api/tls.html
- What TLS is, in plain terms: https://developer.mozilla.org/en-US/docs/Glossary/TLS
- dotenv (how `.env` is loaded): https://github.com/motdotla/dotenv
- TypeORM (DataSource and migrations): https://typeorm.io
- Aiven's own guide to its SSL certificates: I'm not certain of the exact page address, so start at https://aiven.io/docs and search for "TLS/SSL certificates".

## Explain it like I'm new to this

Connecting to a cloud database is like phoning your bank. SSL is a scrambler on the line, so nobody listening in can understand the call. Scrambling alone isn't enough, though: you also want to know you've really reached your bank and not a fraudster who answered first. The server proves who it is by showing a certificate, a bit like an ID card. An ID card is only as good as whoever issued it. Your computer comes with a list of issuers it already trusts, like recognising a government passport. Aiven issues its own ID cards, like a company badge, and your computer had never seen that company's badges before, so it hung up. That was the `self-signed certificate` error. The fix is not to stop checking ID; that would let anyone answer the phone. Instead we gave Node a sample of Aiven's genuine badge (the CA file in `certs/`) so it can recognise the real thing. Separately, there were two switches for the scrambler, one in the database URL and one in `.env`, and the hidden one in the URL always won. We removed the hidden one, so `.env` is now the only place that controls it.
