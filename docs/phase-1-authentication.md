# Phase 1: Foundation & Authentication

> This is the Phase 1 overview. Each building block has its own detailed doc; see [the docs index](README.md), starting with [architecture.md](architecture.md).

## What was built

The skeleton of the backend API, plus a way for people to sign up, sign in, and prove who they are on every later request, without this backend ever handling their password. On top of that sits the permission system that every later feature relies on. Each account has one of five **roles** (General Public, Emergency Responder, Government Official, Researcher, Administrator). Staff accounts can also be limited to one **region** (an area on the map, such as a Local Government Area). A *role* is a label that decides what someone may do; a *region scope* decides where they may do it.

## How it works

A request travels through these files in this order (the layers from section 3 of the standard). All paths are relative to `server/`.

1. **Sign-up and sign-in happen in the client, not here.** The web or mobile app uses the Firebase Authentication SDK directly. Firebase checks and stores the password on its own servers. On success Firebase gives the client an **ID token**: a signed, short-lived (one-hour) proof of identity.
2. **The client sends the token on every API call** as `Authorization: Bearer <token>`.
3. [`src/app.ts`](../server/src/app.ts) builds the Express app. It mounts `authMiddleware` and `resolveUserMiddleware` **once**, for everything under `/api/v1`, before any feature router is attached. Section 11 of the standard explains why: re-declaring them inside each router once made them run many times per request in a previous codebase.
4. [`src/middleware/auth.middleware.ts`](../server/src/middleware/auth.middleware.ts) → `authMiddleware` reads the bearer token and calls `AuthService.verifyToken`. If the token is missing it answers `401 Missing bearer token`.
5. [`src/modules/auth/auth.service.ts`](../server/src/modules/auth/auth.service.ts) → `verifyToken` asks [`firebase-token-verifier.ts`](../server/src/modules/auth/firebase-token-verifier.ts) to check the token with the **Firebase Admin SDK** (`verifyIdToken`). A forged or expired token becomes a `401`. A failure on our side, for example Google's key server being unreachable, becomes a `500` instead of wrongly blaming the user.
6. `resolveUserMiddleware` (same file as step 4) calls `AuthService.resolveUser`. That function looks up our own `users` row by `firebaseUid` through [`src/modules/users/user.repository.ts`](../server/src/modules/users/user.repository.ts). If this Firebase account has never been seen before, it creates the row with role `general_public` and no region scope. The result is attached to the request as `req.user`.
7. **Route-level role check:** each route adds `authorise(...)` from [`src/middleware/authorise.middleware.ts`](../server/src/middleware/authorise.middleware.ts), for example `authorise("administrator")`. Administrators always pass; anyone else not listed gets `403`.
8. **Validation:** `validate(schema)` from [`src/middleware/validate.middleware.ts`](../server/src/middleware/validate.middleware.ts) checks the body, query and URL params against the route's Zod schema (e.g. [`src/modules/users/user.validation.ts`](../server/src/modules/users/user.validation.ts)). Bad input gets a `400` listing every bad field.
9. **Controller → service → repository:** [`user.controller.ts`](../server/src/modules/users/user.controller.ts) only unpacks the request and calls [`user.service.ts`](../server/src/modules/users/user.service.ts), which holds the rules (for example, "an administrator cannot change their own role"). The service reads and writes only through the repository. The repository extends [`src/common/repository/base.repository.ts`](../server/src/common/repository/base.repository.ts), the only code allowed to use the database connection in [`src/config/data-source.ts`](../server/src/config/data-source.ts).
10. **Errors:** anything thrown along the way ends up in `errorHandler` in [`src/middleware/error-handler.middleware.ts`](../server/src/middleware/error-handler.middleware.ts). Known errors (from [`src/common/errors/app-error.ts`](../server/src/common/errors/app-error.ts)) keep their status code. Anything unexpected is logged on the server and returned as a generic `500 Something went wrong`, with no stack trace. Every response, success or failure, uses the same envelope from [`src/common/response/api-response.ts`](../server/src/common/response/api-response.ts): `{ success, data, message, errors?, meta? }`.

**Region scoping** (full detail in [access-control.md](access-control.md)). [`src/common/access/region-access.ts`](../server/src/common/access/region-access.ts) provides `assertRegionAccess` (for single records: throws `403` outside the user's region) and `applyRegionScope` (for lists: quietly filters to the user's region). Later-phase services call these. A region can contain smaller regions, and checking that containment needs the `admin_units` table, which arrives in Phase 2. Until then a scoped user matches only their exact region. This errs toward saying "no" and never toward letting someone see too much. **Phase 2 must swap in the real hierarchy.**

**Database.** [`src/migrations/1790600000000-CreateRolesAndUsers.ts`](../server/src/migrations/1790600000000-CreateRolesAndUsers.ts) creates two tables:

- `roles`, seeded with the five roles.
- `users`, with no password column. `firebase_uid` is unique and required. The database also refuses a region scope on any role other than Emergency Responder or Government Official, repeating a check the service already makes.

How the app connects to the database, including over SSL to a cloud host such as Aiven, is covered in [`database-connection-ssl.md`](database-connection-ssl.md).

**Endpoints added:**

| Method | Path | Who |
|---|---|---|
| GET | `/health` | Anyone (no token) |
| GET | `/api/v1/auth/me` | Any signed-in user; the first call creates the user's row |
| GET | `/api/v1/users?page=&pageSize=` | Administrator |
| GET | `/api/v1/users/:id` | Administrator |
| PATCH | `/api/v1/users/:id/access` | Administrator: sets `role` and/or `scopeAdminUnitId` |

**The first administrator** (see [user-management.md](user-management.md)). Every account starts as `general_public`, so nobody can use the API to promote the first admin. [`src/scripts/set-user-access.ts`](../server/src/scripts/set-user-access.ts) does it directly in the database (`npm run user:set-access -- --email you@example.com --role administrator`). It needs database credentials, which is what restricts it to administrators.

**Tests** ([testing.md](testing.md)): `server/tests/` covers token verification, first-time user creation, role guards, region scoping, validation errors, the error envelope, and that the token is verified only once per request. The tests use in-memory fakes and need no database or Firebase project. The Postman collection in `server/postman/` has one example response per status code for each endpoint.

**Flagged for the team (NEEDS VERIFICATION):**
- `scopeAdminUnitId` is not yet checked against real admin units, because that table doesn't exist until Phase 2. Phase 2 adds the foreign key and the existence check.
- Token *revocation* is not checked: a token stays valid until it expires, at most one hour. Checking revocation needs a Firebase service-account key and an extra network call per request. Decide whether that's needed.
- Unverified email addresses are accepted, and they only ever get the read-only `general_public` role. Decide whether staff promotion should require a verified email.

## Resources to read

- Firebase Authentication overview: https://firebase.google.com/docs/auth
- Verifying ID tokens on the server: https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Firebase Admin SDK setup (Node.js): https://firebase.google.com/docs/admin/setup
- Firebase Auth REST API (what the Postman sign-in request calls): https://firebase.google.com/docs/reference/rest/auth
- What a JWT is (a Firebase ID token is one): https://jwt.io/introduction
- Express middleware: https://expressjs.com/en/guide/using-middleware.html
- Express error handling: https://expressjs.com/en/guide/error-handling.html
- Zod (request validation): https://zod.dev
- TypeORM (entities, repositories, migrations): https://typeorm.io
- PostgreSQL constraints (UNIQUE, FOREIGN KEY, CHECK): https://www.postgresql.org/docs/current/ddl-constraints.html
- Vitest (the test runner): https://vitest.dev

## Explain it like I'm new to this

Think of Firebase Authentication as a professional ID-checking service we hire instead of training our own staff to check IDs. When someone signs up or logs in, Firebase's booth checks their password and hands them a wristband: the ID token. Our backend never sees the password, only the wristband. Every door in our building (every API route) just asks Firebase "is this wristband real?", and that is all `authMiddleware` does. The first time a new wristband comes through any door, we write the person's name in our own guest book (the `users` table) with the lowest access level, so we recognise them next time. The guest book also records what each person may do (their role) and which part of the building they may enter (their region scope). An administrator can later upgrade a guest to staff. Someone with no wristband, or a fake one, is turned away with a `401`. Someone with a real wristband but the wrong access level for that door is turned away with a `403`.
