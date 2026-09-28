# Client Testing: Unit Tests and Cypress

## What was built

Two kinds of automated tests for the web client. **Unit tests** (25, run with Vitest) check small pieces of logic in isolation, such as turning server errors into friendly messages or working out page counts. **End-to-end tests** (27, run with Cypress) drive the real app in a real browser: typing into forms, clicking buttons, checking what appears. They cover sign-in, sign-up, password reset, session handling, the admin Users page and phone-width layout. Neither kind ever talks to a real backend, database or Firebase project (standard section 21).

## How it works

All paths are relative to `client/`.

**Unit tests.** `npm test` runs every `src/**/*.test.ts` with Vitest (configured in [`vite.config.ts`](../../client/vite.config.ts)). They cover:
- [`utils/pagination.test.ts`](../../client/src/utils/pagination.test.ts): `totalPages`/`hasNext`/`hasPrev` from the backend's `meta`, and junk `?page=` values.
- [`transport/api-error.test.ts`](../../client/src/transport/api-error.test.ts): envelope messages kept, field errors kept, HTML error pages and timeouts turned into plain messages, offline detected.
- [`transport/identity-error.test.ts`](../../client/src/transport/identity-error.test.ts): wrong-email and wrong-password give the same message, and Firebase's raw text never shows.
- [`components/users/user-access.schema.test.ts`](../../client/src/components/users/user-access.schema.test.ts): the access form's rules, including clearing the region for roles that can't have one.

**End-to-end tests.** `npm run e2e` starts the app in *e2e mode* (`vite --mode e2e`, port 5174), runs every spec in [`cypress/e2e/`](../../client/cypress/e2e/), then stops the server. `npm run e2e:open` does the same with Cypress's interactive window, which is handy for watching a test run.

**How Cypress signs in without Firebase.** In e2e mode, [`src/transport/identity.ts`](../../client/src/transport/identity.ts) swaps the real Firebase wrapper for [`e2e-identity.ts`](../../client/src/transport/e2e-identity.ts), an in-memory fake that keeps its "session" in `localStorage` and hands out the token `e2e-id-token`. It's predictable on purpose: password `wrong-password` fails sign-in, and email `taken@example.com` fails sign-up. Vite replaces the mode check at build time, so a production build contains only the Firebase branch. That was checked by searching the built files for the fake's markers.

**Custom commands** in [`cypress/support/commands.ts`](../../client/cypress/support/commands.ts):
- `cy.login(role, { user?, emailVerified? })`: seeds the fake session before the page loads and stubs `GET /api/v1/auth/me` (alias `@getMe`) with a user of that role. It never performs a real sign-in.
- `cy.interceptApi(method, path, response)`: `cy.intercept()` for `/api/v1<path>`, answering with the backend's `{ success, data, message, errors?, meta? }` envelope, or with a fixture file such as [`cypress/fixtures/users/list.json`](../../client/cypress/fixtures/users/list.json).
- `cy.dataCy("name")`: finds `[data-cy="name"]`. This is the only way specs select elements, so restyling or rewording a screen doesn't break tests.

**Safety net.** [`cypress/support/e2e.ts`](../../client/cypress/support/e2e.ts) answers any API call a spec forgot to stub with a `599` error, and blocks Google/Firebase hosts. A test can't quietly reach a real server.

**Test data.** [`cypress/support/factories.ts`](../../client/cypress/support/factories.ts) builds stub users shaped exactly like the backend's DTOs. They exist only to feed stubs; the app never renders invented data.

**Running Cypress from VS Code's terminal on Windows.** VS Code sets `ELECTRON_RUN_AS_NODE=1` for its terminals, and Cypress then fails with `bad option: --smoke-test`. Clear it first: `env -u ELECTRON_RUN_AS_NODE npm run e2e` in Git Bash, or `Remove-Item Env:ELECTRON_RUN_AS_NODE; npm run e2e` in PowerShell. A normal terminal outside VS Code doesn't need this.

**Writing a new spec:** stub every request with `cy.interceptApi`, start signed in with `cy.login(role)`, select only by `data-cy`, and put it under `cypress/e2e/<feature>/<thing>.cy.ts`.

## Resources to read

- Vitest guide: https://vitest.dev/guide/
- Cypress `cy.intercept()`: https://docs.cypress.io/api/commands/intercept
- Cypress best practices (including `data-cy` selectors): https://docs.cypress.io/app/core-concepts/best-practices
- Cypress advanced installation (`CYPRESS_INSTALL_BINARY`): https://docs.cypress.io/app/references/advanced-installation
- Vite modes (how e2e mode works): https://vite.dev/guide/env-and-mode

## Explain it like I'm new to this

A unit test is checking a single brick: is it the right size, does it crack under this weight? A Cypress test is a robot walking through the finished house: it opens the front door, flips the light switch and checks the light comes on. Our robot walks through a *film set* of the house. The backend is a cardboard wall with a painted-on reply (`cy.interceptApi`), and Firebase is an actor playing the ID office (the fake identity). That way the robot can rehearse a thousand times without bothering the real office, touching real records, or failing just because the internet is slow.
