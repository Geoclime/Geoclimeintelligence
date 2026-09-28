# Phase 1 (web client): Foundation & Authentication

> The frontend half of Phase 1. The backend half is [phase-1-authentication.md](../phase-1-authentication.md). Each building block below has its own detailed doc, and the [docs index](../README.md) lists them in reading order.

## What was built

The web app in [`client/`](../../client/), built to *Frontend Engineering Standards — Climate & Disaster Platform*. People can create an account, sign in, reset a forgotten password and sign out. Once signed in they land on an **Overview** page that shows what their account may do (its role) and where (its region). Administrators also get a **Users** page, where they can give other accounts staff roles and limit responders and officials to one region.

There is no map or climate data yet. Those need backend endpoints that arrive in later phases, and the standard forbids building screens against endpoints that don't exist or filling them with sample data (sections 17.1 and 19.4). The Overview says so honestly instead.

| Screen | Path | Who |
|---|---|---|
| Sign in | `/sign-in` | Signed-out visitors |
| Create an account | `/sign-up` | Signed-out visitors |
| Reset password | `/forgot-password` | Signed-out visitors |
| Overview | `/` | Any signed-in user |
| Users | `/admin/users?page=` | Administrators |

## How it works

Read these in order. Each one covers one layer of the app:

1. [client-architecture.md](client-architecture.md): the layers (pages → hooks → endpoints → transport), the folders, configuration, and the lint rules that enforce the standard.
2. [signing-in-with-firebase.md](signing-in-with-firebase.md): the sign-in flow end to end, from the form, through Firebase and `AuthContext`, to `GET /api/v1/auth/me`, including the route guards.
3. [ui-foundations.md](ui-foundations.md): the design tokens, light and dark themes, shared components, and the Modal and toasts that replace browser dialogs.
4. [admin-user-management-ui.md](admin-user-management-ui.md): the Users page, paging, and the access form.
5. [client-testing.md](client-testing.md): the unit tests and the Cypress suite, and how Cypress signs in without Firebase.
6. [client-deployment-vercel.md](client-deployment-vercel.md): putting the client on Vercel.
7. [auth-email-templates.md](auth-email-templates.md): the Firebase console settings behind the verification and password-reset emails.

**Checked before handing over:** typecheck (the app and the Cypress specs), ESLint, 25 unit tests and 27 Cypress end-to-end tests all pass, and so does the production build. The production bundle was searched to confirm the test-only fake sign-in code isn't in it. The screens were also reviewed in light and dark themes, on desktop and on a 390px-wide phone.

**Flagged for the team (NEEDS VERIFICATION):**
- **The standard's route name differs from the backend.** Standard section 12 calls the "who am I" endpoint `GET /api/v1/me`. The backend mounts it at `GET /api/v1/auth/me`, and the client uses the real one. The standard doc should be updated to match.
- **Display names can't be set yet.** The backend copies the display name from the Firebase token once, when it first creates the user's row, and has no endpoint to change it afterwards. A fresh email/password account has no display name at that moment, so sign-up doesn't ask for one. It would be ignored. Adding a name needs a backend `PATCH /api/v1/auth/me` (or similar) first.
- **Region scope is a raw ID for now.** Admin units arrive in Phase 2, so the access form takes a region's UUID instead of a picker, and the Overview shows the ID instead of a name. Swap in a picker once `admin_units` has an endpoint.
- **Email verification isn't enforced.** New accounts are sent a verification link and the Overview nudges them, but unverified accounts can still sign in. This matches the backend's open question in [phase-1-authentication.md](../phase-1-authentication.md).
- **Version choices:** React Router is on v7, not v8, because v8 needs Node 22.22+ and this machine runs 22.15. TypeScript is 6.0, not 7 like the server, because `typescript-eslint` doesn't support 7 yet.

## Resources to read

- React, the official tutorial: https://react.dev/learn
- TypeScript everyday types: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html
- Vite getting started: https://vite.dev/guide/
- Firebase Auth for Web, getting started: https://firebase.google.com/docs/auth/web/start
- React Router modes (this app uses "data" mode): https://reactrouter.com/start/modes

## Explain it like I'm new to this

Think of the backend as a records office and this client as its front counter. Phase 1 builds the counter itself: the door you walk in through (sign-in), the window that tells you what your pass lets you do (the Overview), and a back office where the manager hands out staff passes (the Users page). The actual records, like maps, rainfall and flood reports, aren't on the shelves yet. Rather than stacking fake folders on them to look busy, the counter puts up a sign saying "coming soon", because on a disaster platform a fake number can send help to the wrong place.
