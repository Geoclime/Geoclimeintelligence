# Configuration, Logging & HTTP Security Basics

## What was built

The code that loads the backend's settings (database address, Firebase project, port and so on), checks them before anything else runs, and sets up logging and basic web security. Settings live outside the code in a `.env` file, so the same code can run on a laptop, on staging and in production with different values, and secrets never get committed to git.

## How it works

All paths are relative to `server/`.

**1. Where settings come from.** [`.env.example`](../server/.env.example) is the committed template; each developer copies it to `.env` (git-ignored) and fills it in. [`src/config/env.ts`](../server/src/config/env.ts) loads `.env` with the `dotenv` package. A value already set in the real environment, for example by a hosting platform, wins over the same value in `.env`.

**2. Every setting is checked at startup.** `env.ts` describes every setting in one Zod schema, then parses `process.env` once. If anything is missing or invalid, the app prints a list of what's wrong and refuses to start. The rest of the code imports the typed `env` object and never reads `process.env` directly, so `env.PORT` is already a number and `env.CORS_ORIGINS` is already a list.

| Setting | Required? | Default | What it does |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` or `production`. In development, the database layer also logs warnings and migrations |
| `PORT` | no | `4000` | Port the API listens on |
| `LOG_LEVEL` | no | `info` | How chatty logs are: `fatal` `error` `warn` `info` `debug` `trace` `silent` |
| `DATABASE_URL` | **yes** | – | PostgreSQL connection string |
| `DATABASE_SSL` | no | `false` | Encrypt the database connection. See [database-connection-ssl.md](database-connection-ssl.md) |
| `DATABASE_SSL_CA` | no | – | Path to the database provider's CA certificate |
| `FIREBASE_PROJECT_ID` | **yes** | – | The Firebase project whose ID tokens this API accepts |
| `CORS_ORIGINS` | no | empty | Comma-separated browser origins allowed to call the API |

Tests don't use `.env`. [`vitest.config.mts`](../server/vitest.config.mts) sets harmless dummy values, because the tests never touch a real database or Firebase.

**3. Firebase setup.** [`src/config/firebase.ts`](../server/src/config/firebase.ts) creates the Firebase Admin app once, the first time it's needed, using only `FIREBASE_PROJECT_ID`. Checking ID tokens needs nothing more: the Admin SDK downloads Google's public signing keys itself. There's no service-account key file in Phase 1. If the standard `GOOGLE_APPLICATION_CREDENTIALS` variable is set, the SDK picks it up automatically for later features that need more access.

**4. Logging.** [`src/config/logger.ts`](../server/src/config/logger.ts) sets up **pino**. It writes one JSON object per line, for example `{"level":30,"time":...,"service":"climate-platform-server","msg":"Database connected"}`. Level 30 is `info` and 50 is `error`. One-object-per-line logs are easy for hosting platforms to search. The logger is told to hide `req.headers.authorization`, so if request headers are ever logged, the user's token won't be.

**5. HTTP security basics.** These are set in [`src/app.ts`](../server/src/app.ts), before any route:
- **helmet** adds standard security headers to every response, for example telling browsers not to guess content types.
- **CORS** controls which websites' JavaScript may call this API from a browser. Only the origins in `CORS_ORIGINS` are allowed. If it's empty, no CORS headers are sent, so browsers block all cross-site calls. Postman and server-to-server calls aren't affected, because CORS is a browser rule.
- **JSON body limit**: request bodies over 1 MB are rejected with `413 Request body too large`. That stops someone from tying up the server with a huge upload.

**Flagged for the team (NEEDS VERIFICATION):**
- `CORS_ORIGINS` for staging and production depends on where the frontend will be hosted. Fill it in once that's decided.
- Logs currently go to standard output only. Where they're collected and kept in staging and production is the Cloud Engineer's decision.

## Resources to read

- The "config in the environment" principle: https://12factor.net/config
- dotenv: https://github.com/motdotla/dotenv
- Zod: https://zod.dev
- pino (logger): https://getpino.io
- helmet (security headers): https://helmetjs.github.io
- CORS, explained by MDN: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- Firebase Admin SDK setup: https://firebase.google.com/docs/admin/setup

## Explain it like I'm new to this

Think of `.env` as the settings card taped inside a machine's panel, and `env.ts` as the engineer who reads that card before switching the machine on. If a required line is blank or says something nonsensical, like "port: banana", the engineer refuses to start the machine and tells you exactly which line is wrong. That's far better than the machine starting and breaking halfway through a job. The card is different on each site (laptop, staging, production) while the machine stays identical, and the card never leaves the building (it's git-ignored). The logger is the machine's logbook, written in a strict format so it's easy to search. Helmet and CORS are the doorman's standing orders: add the standard safety notices to every reply, and only let web pages from approved addresses talk to us.
