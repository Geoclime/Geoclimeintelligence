# Deploying the API to Render

## What was built

A configuration file that lets **Render**, a cloud hosting service, run the backend API on the internet so the frontend and other users can reach it. Every time code under `server/` is pushed to GitHub, Render checks it, builds it, updates the database tables if needed, and swaps in the new version, with no manual steps after the first setup.

## How it works

**1. The Blueprint: [`render.yaml`](../render.yaml)** at the repository root. Render calls a config file like this a *Blueprint*: the whole service described in code, rather than clicked together in a dashboard. It defines one **web service** called `geoclime-api`:

| Setting | Value | Why |
|---|---|---|
| `rootDir` | `server` | Render only looks inside `server/`, and only commits that touch `server/` trigger a deploy |
| `region` | `frankfurt` | The closest Render region to Nigeria. It should match the Aiven database's region; see "Flagged" below |
| `plan` | `free` | See the free-plan limits below |
| `buildCommand` | `npm ci --include=dev && npm run typecheck && npm test` | Installs packages, then **blocks the deploy if the typecheck or any test fails**. `--include=dev` is needed because the app runs through `tsx`, a dev dependency (standard section 2), and npm skips dev dependencies when `NODE_ENV=production` |
| `startCommand` | `npm run migration:run && npm start` | Applies any new migrations, then starts the API. If a migration fails, the new version never starts, and Render keeps the old one running |
| `healthCheckPath` | `/health` | Render calls this to know the new version is up before sending traffic to it |

**2. Settings (environment variables).** These are the same ones as in [configuration-and-logging.md](configuration-and-logging.md). `render.yaml` sets the non-secret ones directly: `NODE_VERSION=22`, `NODE_ENV=production`, `LOG_LEVEL=info` and `DATABASE_SSL=true`. The secret or deployment-specific ones are marked `sync: false`, which means Render asks for them in its dashboard and they're never written into the repository:
- `DATABASE_URL`: the Aiven Service URI.
- `FIREBASE_PROJECT_ID`
- `CORS_ORIGINS`: the frontend's web address once it's deployed. It can stay empty until then.

**3. The database certificate.** The API needs Aiven's CA certificate to connect securely (see [database-connection-ssl.md](database-connection-ssl.md)). The certificate isn't in git, so it's uploaded to Render as a **Secret File** named `aiven-ca.pem`. Render places secret files at `/etc/secrets/<filename>`, which is why `render.yaml` sets `DATABASE_SSL_CA=/etc/secrets/aiven-ca.pem`.

**4. Shutdown.** When Render replaces or stops the service, it sends `SIGTERM`. [`src/server.ts`](../server/src/server.ts) already handles that: it finishes in-flight requests, closes the database connection and exits (see [architecture.md](architecture.md)). `PORT` is set by Render, and `env.ts` reads it.

**First-time setup (once):**
1. Commit `render.yaml` and push it to GitHub (`Geoclime/Geoclimeintelligence`).
2. In the Render dashboard: **New → Blueprint**, connect the GitHub repository, and let Render read `render.yaml`. When it asks, fill in `DATABASE_URL`, `FIREBASE_PROJECT_ID` and, optionally, `CORS_ORIGINS`.
3. Open the new `geoclime-api` service, go to **Environment → Secret Files**, add a file named `aiven-ca.pem`, and paste in the contents of `server/certs/aiven-ca.pem`. The very first deploy may fail before this file exists, with `ENOENT ... /etc/secrets/aiven-ca.pem`. After adding it, run **Manual Deploy → Deploy latest commit**.
4. If Aiven's **Allowed IP addresses** setting is restricted (by default it allows everyone), add the outbound IP addresses Render lists for the service.
5. Check `https://<service-url>/health`. It should return `{"success":true,"data":{"status":"ok"},"message":"OK"}`. Render shows the exact URL at the top of the service page; it's usually `https://geoclime-api.onrender.com`, with a suffix if that name is taken.
6. Put that URL into `baseUrl` in [`server/postman/production.postman_environment.json`](../server/postman/production.postman_environment.json) (see [postman-collection.md](postman-collection.md)).

**After that,** every push to `main` that changes `server/` deploys automatically. The deploy logs in the Render dashboard show the typecheck, the tests, the migrations and the `API listening` line.

**Free plan limits.** A free Render web service goes to sleep after about 15 minutes with no traffic, and the next request waits roughly a minute while it wakes up. That's fine for development and demos. A platform that issues disaster alerts can't be asleep when it's needed, so move to a paid instance before real use. Render's paid plans also offer a separate **pre-deploy command**; the migration step should move there, particularly before running more than one instance, so two instances never run migrations at the same time.

**Checked before committing:** the build steps (`typecheck`, 33 tests) pass with `NODE_ENV=production`. The start command was run locally in production mode against the Aiven database: it reported "No migrations are pending", connected, and `/health` answered. I couldn't check the Blueprint itself against Render's live spec from this machine, because Render's docs site was unreachable. Render validates `render.yaml` when the Blueprint is created and will name any field it rejects.

**Flagged for the team (NEEDS VERIFICATION):**
- **Production and local development currently share one database.** The Aiven `defaultdb` that local `.env` files point at is the same one this deployment will use. A migration tested on a laptop would change production data, and test sign-ups would land in the production `users` table. Give production its own Aiven database (or service) and its own login, not `avnadmin`, before real users arrive.
- **Region:** set `region` in `render.yaml` to match the Aiven service's cloud region, shown in the Aiven console. The region can't be changed after the Render service exists; it would have to be recreated.
- **Plan:** choose free or paid (see above).
- Standard section 1 puts infrastructure under the Cloud Engineer, so this setup should be reviewed by them.

## Resources to read

These are Render's official docs pages. I couldn't load render.com from this machine to re-check them, so if a link has moved, search Render's docs for the page title.
- Blueprint specification (every `render.yaml` field): https://render.com/docs/blueprint-spec
- Environment variables and Secret Files: https://render.com/docs/configure-environment-variables
- Free instance limits: https://render.com/docs/free
- Health checks: https://render.com/docs/health-checks

These I could check:
- `npm ci` and `--include`: https://docs.npmjs.com/cli/commands/npm-ci
- Node.js process signals (`SIGTERM`): https://nodejs.org/api/process.html#signal-events
- The "config in the environment" principle: https://12factor.net/config

## Explain it like I'm new to this

Running the API on your laptop is like cooking in your own kitchen: only you can eat. Render is a restaurant kitchen that's open to the public. `render.yaml` is the recipe card pinned to the kitchen wall: which ingredients to fetch (install packages), which checks to make before cooking (typecheck and tests; if anything fails, nothing new gets served), what to prepare first (migrations), and how to know the dish is ready (the `/health` check). Secret ingredients, like the database password and the certificate, aren't written on the card for everyone to see. They're kept in the kitchen's locked cupboard (Render's environment variables and Secret Files). Every time the recipe changes on GitHub, the kitchen automatically cooks the new version and only swaps it in once it's ready. On the free plan, though, the kitchen closes when nobody's ordering and takes about a minute to reopen.
