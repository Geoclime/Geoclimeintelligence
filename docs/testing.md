# Automated Tests

## What was built

A set of automated tests (33 in Phase 1) that check the backend behaves correctly: logins are verified, roles are enforced, bad input is rejected, and errors come back in the right shape. They run in a couple of seconds with no database and no Firebase account, so every developer can run them before every commit.

## How it works

All paths are relative to `server/`.

**Running them.**

```bash
npm test            # run everything once
npm run test:watch  # re-run on every file save
```

The runner is **Vitest**, configured in [`vitest.config.mts`](../server/vitest.config.mts). It picks up `tests/**/*.test.ts` and sets dummy settings, such as a fake database URL, so the app's startup checks pass without real credentials. It also pins `DATABASE_SSL=false`, overriding whatever a developer's own `.env` says: [`data-source.ts`](../server/src/config/data-source.ts) reads the `DATABASE_SSL_CA` certificate file the moment it's imported, not when it connects, and that path (see [database-connection-ssl.md](database-connection-ssl.md)) only ever resolves on the machine that wrote `.env`. Without this override, tests would pass by accident on a developer's own machine and fail in CI or on Render with `ENOENT`, because the certificate file is gitignored and the app under test is imported before any fake is swapped in.

**Fakes instead of real services.** [`tests/fakes.ts`](../server/tests/fakes.ts) provides stand-ins:
- `InMemoryUserRepository` is a `users` table kept in memory. It implements the same `IUserRepository` interface as the real repository.
- `FakeTokenVerifier` accepts any token of the form `valid:<uid>` and rejects everything else with the same `auth/...` error code Firebase uses.
- `makeUser()` builds a test user with sensible defaults, and you override only what matters, for example `makeUser({ role: "administrator" })`.

This works because the services take interfaces, not concrete classes (see [architecture.md](architecture.md)).

**Unit tests** test one class directly with fakes handed to its constructor:

| File | What it proves |
|---|---|
| [`tests/unit/auth.service.test.ts`](../server/tests/unit/auth.service.test.ts) | Valid tokens pass. Bad tokens become `401`. A Firebase *outage* becomes a `500`, not a misleading `401`. First-time users are created as `general_public` with no scope |
| [`tests/unit/user.service.test.ts`](../server/tests/unit/user.service.test.ts) | The access-change rules: promotion, no self-change, `404`, scope only on staff roles |
| [`tests/unit/region-access.test.ts`](../server/tests/unit/region-access.test.ts) | Region checks against a made-up state → LGA → ward tree, and that the Phase 1 stand-in fails closed |
| [`tests/unit/pagination.test.ts`](../server/tests/unit/pagination.test.ts) | Cursor round-trip, tampered cursor gives `400`, and page defaults and the 100 cap |

**Integration tests.** [`tests/integration/app.test.ts`](../server/tests/integration/app.test.ts) drives the *real* Express app from `createApp()`, with its real middleware order, routers, validation and error handler, using **supertest** to send HTTP requests without opening a port. Before each test, `vi.spyOn(AuthService, "Instance", "get")` makes `AuthService.Instance` return a service built on the fakes, and the same is done for `UserService`. It checks:
- `/health` needs no token.
- Missing or forged tokens get `401`.
- A first-time token creates a user.
- **The token is verified exactly once per request.** This is a guard against repeating the section 11 production incident.
- Admin-only routes return `403` for others, with field-level `400`s and unknown body fields rejected.
- Malformed JSON gives `400`, an internal crash gives a generic `500`, and an unknown route gives `404`.

**What the tests don't cover:** the real repository SQL and the real Firebase call. Those were checked by hand against the Aiven database and are also exercised by the Postman collection ([postman-collection.md](postman-collection.md)). Database-backed tests may be worth adding once PostGIS queries arrive in Phase 2, since that logic lives in SQL.

**Before every commit:** run `npm run typecheck` and `npm test`. Both must be clean.

## Resources to read

- Vitest: https://vitest.dev
- `vi.spyOn` and mocking: https://vitest.dev/api/vi.html
- supertest: https://github.com/ladjs/supertest
- Test doubles (fakes, stubs, mocks) explained: https://martinfowler.com/bliki/TestDouble.html

## Explain it like I'm new to this

Testing the backend against the real database and real Firebase every time would be like rehearsing a play only on opening night, with a live audience. Instead we rehearse with stand-ins: a cardboard filing cabinet that behaves like the real one (`InMemoryUserRepository`), and a pretend ID checker that accepts any badge reading "valid:" (`FakeTokenVerifier`). Unit tests rehearse one actor's lines at a time. Integration tests run the whole scene, with the real stage, real doors and real guards, and only the cabinet and ID checker as props. Because the stand-ins behave exactly like the real things from the actors' point of view, a scene that works in rehearsal works on the night. The rehearsal takes two seconds, so there's no excuse to skip it.
