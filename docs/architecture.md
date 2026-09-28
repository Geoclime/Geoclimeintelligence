# Backend Architecture

## What was built

The overall shape of the backend: how the code is organised into folders, what each layer is responsible for, and the path a request takes from arriving at the server to getting a response. Every feature built from Phase 2 onwards (admin units, disaster events, rainfall, alerts) slots into this same shape, so this is the doc to read first.

## How it works

**The stack.** The API is written in **TypeScript** (JavaScript with type checking) and runs on **Node.js**. **Express 5** is the web framework that receives HTTP requests. **TypeORM** reads and writes **PostgreSQL**, the database. **Firebase Authentication** handles sign-up, sign-in and passwords. **Zod** checks incoming data, and **pino** writes logs. The standard (section 1) explains why this stack was chosen: the team already had a proven standard for it.

**The layers.** Every request passes through the same layers, in this order. No layer skips a neighbour: a controller never calls the database directly, and a service never touches the HTTP request.

```
  HTTP request
      │
      ▼
  app.ts ─ helmet, CORS, JSON body parser (1 MB limit)
      │
      ▼
  authMiddleware ─────────── is the Firebase ID token real?        (401 if not)
      │                      mounted ONCE for all of /api/v1
      ▼
  resolveUserMiddleware ──── find/create our users row → req.user
      │
      ▼
  authorise(roles) ───────── is this role allowed on this route?   (403 if not)
      │
      ▼
  validate(schema) ───────── is the body/query/URL well-formed?    (400 if not)
      │
      ▼
  Controller ─────────────── unpack request, call ONE service method, wrap in envelope
      │
      ▼
  Service ────────────────── business rules, region checks (403/404/422)
      │
      ▼
  Repository ─────────────── the only code that talks to the database
      │
      ▼
  Entity → PostgreSQL

  Any error thrown anywhere above ──► errorHandler ──► { success: false, ... }
```

Section 3 of the standard lists validation first. Here, authentication runs first because it's mounted once for the whole API (see "One rule learned the hard way" below). The effect is the same: nothing reaches a controller unchecked.

**Folder layout.** The code is grouped by *feature*, not by layer. Everything about users lives in one folder. All paths are relative to `server/`.

```
src/
  server.ts            entry point: connect to the database, then start listening
  app.ts               builds the Express app: global middleware, routers, error handler
  config/              settings loaded once at startup (env, database, Firebase, logger)
  common/              shared code every feature uses
    access/            roles, the signed-in-user type, region-scope checks
    errors/            AppError and its subclasses (400, 401, 403, 404, 422)
    pagination/        page/pageSize and cursor helpers
    repository/        BaseRepository, the parent of every repository
    response/          the { success, data, message } envelope
  middleware/          authMiddleware, authorise, validate, errorHandler
  modules/             one folder per feature
    auth/              token verification, GET /auth/me
    users/             entity, repository, service, controller, routes, validation
  migrations/          database changes, one file per change, run in order
  scripts/             command-line tools (e.g. promote the first administrator)
  types/               adds req.user / req.firebaseUser to Express's Request type
tests/                 unit and integration tests
postman/               API collection and environments
```

A feature module holds one file per layer: `*.routes.ts`, `*.validation.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.entity.ts`, and sometimes a `*.types.ts` for shared shapes. [`src/modules/users/`](../server/src/modules/users/) is the complete example to copy.

**Startup and shutdown.** [`src/server.ts`](../server/src/server.ts) connects to the database first and only then starts accepting requests, so the API never answers while it can't reach its data. When it receives `SIGINT` (Ctrl+C) or `SIGTERM` (a hosting platform stopping it), it stops taking new requests, lets in-flight ones finish, closes the database connection, and exits. If startup fails, it logs the reason and exits with code 1. [`src/app.ts`](../server/src/app.ts) builds the app in a function, `createApp()`, and doesn't start it. That lets tests drive the real app without opening a network port.

**Patterns you'll see everywhere.**

- **One shared instance per class ("singleton").** Services and repositories expose `static get Instance()`, which creates the object the first time it's asked for and returns that same object afterwards, for example `UserService.Instance`. Application code always goes through `.Instance`.
- **Depend on an interface, not the database.** `UserService` takes an `IUserRepository` ([`user.types.ts`](../server/src/modules/users/user.types.ts)), not the concrete `UserRepository`. `AuthService` takes a `TokenVerifier`, not Firebase itself, and `RegionAccess` takes a `RegionHierarchy`. Tests can hand in in-memory fakes, and Phase 2 can swap in the real region lookup without touching any service. The constructors are public for that reason. The standard's examples show them private; they were made public on purpose so tests can inject fakes.
- **Thin controllers, fat services.** A controller is a few lines: read the request, call one service method, return `ok(result)`. Every rule, such as "an administrator can't change their own role", lives in a service, where it can be tested without HTTP.
- **Three shapes of a user.** `User` ([`user.entity.ts`](../server/src/modules/users/user.entity.ts)) is the database row. `AuthUser` ([`auth-user.ts`](../server/src/common/access/auth-user.ts)) is the signed-in user every layer sees as `req.user`. `UserDto` is what the API sends back, with dates as ISO strings. The `toAuthUser` and `toUserDto` functions convert between them, so the database shape never leaks straight into responses.

**One rule learned the hard way (section 11).** In the codebase this standard came from, every feature router added the auth middleware itself. Express checks every router mounted under a shared path, so auth ran once *per router* on every request and slowed everything down. Here, `authMiddleware` and `resolveUserMiddleware` are mounted exactly once in `app.ts`, before any router, and feature routers only add `authorise(...)`. A test in [`tests/integration/app.test.ts`](../server/tests/integration/app.test.ts) fails if the token is ever verified more than once per request.

**Rules for anyone adding code** (sections 2 and 13 of the standard):
- TypeScript runs in strict mode ([`tsconfig.json`](../server/tsconfig.json)). No `any` without a comment explaining why.
- Everything runs through `tsx`, never plain `node`. `npm run typecheck` must be clean before any commit.
- `tsx` doesn't emit the type information TypeORM decorators normally rely on, so every `@Column` spells out its `type`.
- No layer-skipping, and no re-mounting auth middleware in a router.
- Every change ships with its doc in `docs/` (section 18).

**What isn't built yet:** there's no `common/geo/` folder yet, because geometry arrives in Phase 2, and there are no email or file-upload services (sections 14–15 of the standard, both Future work). The feature folders listed in section 3 (`admin-units/`, `disaster-events/` and so on) will be added phase by phase.

## Resources to read

- Express routing and middleware: https://expressjs.com/en/guide/routing.html and https://expressjs.com/en/guide/using-middleware.html
- What changed in Express 5 (async errors are forwarded automatically): https://expressjs.com/en/guide/migrating-5.html
- TypeScript handbook: https://www.typescriptlang.org/docs/
- What `strict` turns on: https://www.typescriptlang.org/tsconfig/#strict
- tsx (runs TypeScript directly): https://tsx.is
- Layering (presentation, domain, data): https://martinfowler.com/bliki/PresentationDomainDataLayering.html
- The Repository pattern: https://martinfowler.com/eaaCatalog/repository.html
- The Singleton pattern: https://refactoring.guru/design-patterns/singleton
- Dependency injection (why services take interfaces): https://martinfowler.com/articles/injection.html
- Node.js process signals (graceful shutdown): https://nodejs.org/api/process.html#signal-events

## Explain it like I'm new to this

Picture the backend as a government office. At the front door, security (`authMiddleware`) checks your ID badge, and the receptionist (`resolveUserMiddleware`) looks you up in the register. At each department's door, a guard (`authorise`) checks whether your job title lets you in. A clerk (`validate`) then checks your form is filled in properly. The desk officer (the controller) takes your form and passes it to the specialist who knows the rules (the service). The specialist never walks into the records room; they ask the archivist (the repository), the only person with a key. If anything goes wrong at any step, the complaint goes to one customer-service desk (`errorHandler`), which always replies on the same letterhead (the response envelope) and never shows you internal memos. Each department (feature module) has its own staff for every one of these roles. Security at the front door checks you *once*, not again at every department, and that's the lesson from section 11.
