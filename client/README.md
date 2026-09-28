# Climate Platform Web Client (client)

Web app for the Climate Intelligence & Disaster Management Platform (Rivers State, Nigeria):
React 19 + TypeScript + Vite, with Firebase Authentication for sign-in and the API in
[`../server/`](../server/) for everything else. It follows *Frontend Engineering Standards — Climate &
Disaster Platform*. Per-feature explanations live in [`../docs/features/`](../docs/features/). Start with
[`phase-1-client.md`](../docs/features/phase-1-client.md).

**Status:** Phase 1 (Foundation & Authentication) is done: sign-in, sign-up, password reset, the
Overview page, and Administrator user management.

## Prerequisites

- Node.js 22.12+
- The API running locally (see [`../server/README.md`](../server/README.md)), with `CORS_ORIGINS` including `http://localhost:5173`
- The same Firebase project the API uses, with the **Email/Password** provider enabled and a **Web app** registered

## Setup

```bash
cd client
npm install
cp .env.example .env     # then fill in VITE_API_URL and the Firebase web config
npm run dev              # http://localhost:5173
```

Missing or invalid settings show a "This app isn't configured yet" screen that lists them. See
[`docs/features/client-architecture.md`](../docs/features/client-architecture.md).

To make yourself an Administrator: create an account in the app, then follow "Your first administrator"
in the server README and reload.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | `tsc` over the app and the Cypress specs |
| `npm run lint` | ESLint, including the standard's layering, no-dialog and file-size rules |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Cypress end-to-end tests, fully stubbed, no backend or Firebase needed |
| `npm run e2e:open` | The same, in Cypress's interactive window |

From VS Code's terminal on Windows, run Cypress as `env -u ELECTRON_RUN_AS_NODE npm run e2e` (Git Bash). See
[`docs/features/client-testing.md`](../docs/features/client-testing.md).

## Deployment

Vercel, with the project's Root Directory set to `client`: see
[`docs/features/client-deployment-vercel.md`](../docs/features/client-deployment-vercel.md).

## Layout

```
src/
  main.tsx, App.tsx, routes.tsx   # entry, providers, route table (lazy pages)
  config/env.ts                   # validated VITE_ settings
  transport/                      # httpClient, ApiError, identity (Firebase / e2e fake)
  endpoints/                      # one typed function per backend route
  hooks/                          # feature data hooks + useAuth/useToast/useTheme
  contexts/                       # AuthContext, ThemeContext, ToastContext
  components/
    shared/                       # Button, TextField, Modal, Toast, states, Pagination…
    layout/                       # AppShell, AuthLayout, UserMenu, ThemeToggle
    routing/                      # RequireAuth, GuestOnly, RequireRole
    users/                        # RoleBadge, UserTable, UserAccessDialog
  pages/                          # auth/, home/, admin/, NotFound, RouteError
  types/, utils/, styles/
cypress/                          # e2e specs, support commands, fixtures
```
