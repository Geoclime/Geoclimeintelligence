# Climate Platform API (server)

Backend for the Climate Intelligence & Disaster Management Platform (Rivers State, Nigeria):
Node.js + TypeScript (strict) + Express 5 + TypeORM + PostgreSQL, with identity delegated to
Firebase Authentication. It follows *Backend Engineering Standards — Climate & Disaster
Platform*. Per-feature explanations live in [`../docs/`](../docs/). Start with the [docs index](../docs/README.md).

**Status:** Phase 1 (Foundation & Authentication) and Phase 2 (Admin Geography) are done. See
[`docs/phase-1-authentication.md`](../docs/phase-1-authentication.md), [`docs/admin-geography.md`](../docs/admin-geography.md)
and [`docs/data-import.md`](../docs/data-import.md).

## Prerequisites

- Node.js 20.19+ or 22.13+
- PostgreSQL 15+ with the PostGIS extension available (the Phase 2 migrations run `CREATE EXTENSION postgis` and use `NULLS NOT DISTINCT`)
- A Firebase project with the **Email/Password** sign-in provider enabled

## Setup

```bash
cd server
npm install
cp .env.example .env        # then fill in DATABASE_URL and FIREBASE_PROJECT_ID
npm run migration:run       # roles/users, then PostGIS, data_sources, countries, admin_units and the import tables
npm run dev                 # http://localhost:4000, restarts on file changes
```

For a cloud database such as Aiven, also set `DATABASE_SSL=true` and point `DATABASE_SSL_CA` at the
provider's CA certificate. See [`docs/database-connection-ssl.md`](../docs/database-connection-ssl.md).

`FIREBASE_PROJECT_ID` is in the Firebase console under *Project settings → General*. Verifying ID
tokens needs nothing else: no service-account key.

## Deployment

The API deploys to Render from [`../render.yaml`](../render.yaml): see [`docs/deployment-render.md`](../docs/deployment-render.md).

## Your first administrator

Easiest (Phase 2): put your email in `server/.env` as `BOOTSTRAP_ADMIN_EMAIL`, sign up in the client app,
verify your email (the client won't sign you in before that), and sign in. While the platform has no administrator, that verified account becomes
one. See [`docs/user-management.md`](../docs/user-management.md). Or, from the command line:

Every account starts as `general_public`, so bootstrap the first admin from the command line:

1. Sign up through Firebase: use the Postman request *Auth → Firebase: sign up*, or your client app.
2. Call `GET /api/v1/auth/me` once with that token. This creates your `users` row.
3. `npm run user:set-access -- --email you@example.com --role administrator`

From then on, manage roles and region scopes through `PATCH /api/v1/users/:id/access`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run the API with reload (tsx watch) |
| `npm start` | Run the API (tsx) |
| `npm run typecheck` | `tsc --noEmit`. Must be clean before any commit |
| `npm test` | Unit and integration tests (Vitest; no database or Firebase needed) |
| `npm run migration:run` / `migration:revert` / `migration:show` | TypeORM migrations |
| `npm run user:set-access -- --email <e> --role <r> [--scope <adminUnitId>]` | Administrator-only role bootstrap |

Everything runs through `tsx`, never plain `node` (standard §2). tsx doesn't emit decorator
type metadata, so **every TypeORM `@Column` must declare its `type` explicitly**.

## Postman

Import `postman/climate-platform.postman_collection.json` and `postman/local.postman_environment.json`.
Fill in `firebaseApiKey` (Firebase console → Project settings → *Web API key*), `email` and
`password` in the environment, then run **Auth → Firebase: sign in**. Its post-response script
stores the ID token in `{{accessToken}}`, and every other request uses it. Tokens expire after an hour;
re-run sign-in to refresh.

## Layout

```
src/
  app.ts                 # Express app; auth mounted once for /api/v1 (standard §11)
  server.ts              # entry point: connect DB, listen
  config/                # env validation, TypeORM DataSource, Firebase app, logger
  common/
    access/              # roles, AuthUser, region-scope guard
    errors/              # AppError + subclasses
    pagination/          # offset + cursor helpers
    repository/          # BaseRepository<T>
    response/            # ApiResponse envelope
  middleware/            # authMiddleware, resolveUserMiddleware, authorise, validate, errorHandler
  modules/
    auth/                # token verification, GET /auth/me
    users/               # User/Role entities, admin user management
    admin-units/         # countries, admin_units (state/LGA/ward), map layers, locate
    data-sources/        # data_sources; imports/ is the file -> staging -> checks -> promote pipeline
  migrations/
  scripts/
tests/                   # vitest, with in-memory fakes in tests/fakes.ts
postman/                 # collection + local/staging/production environments
```
