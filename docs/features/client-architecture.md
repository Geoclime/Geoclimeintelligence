# Client Architecture

## What was built

The skeleton every client feature plugs into: a React + TypeScript app built with Vite, organised in the layers the standard requires (sections 2–3), a checked configuration file, and lint rules that fail the build if code skips a layer or breaks one of the standard's hard rules.

## How it works

All paths are relative to `client/`.

**The layers.** A request for data always travels down this chain, and nothing may skip a step:

```
Page (src/pages/)            what's on screen, and URL state such as ?page=2
  └─ Hook (src/hooks/)       loading / error / data for one feature
      └─ Endpoint (src/endpoints/)   one named function per backend route
          └─ Transport (src/transport/)   the single HTTP client + Firebase
              └─ Backend API
```

- **Transport:** [`src/transport/http.ts`](../../client/src/transport/http.ts) is the only HTTP client (`httpClient`). It attaches the Firebase ID token to every request, retries once after a `401` with a forced token refresh, retries failed reads twice on network errors or `502/503/504` (the API's free hosting sleeps and takes time to wake), and turns every failure into an `ApiError` from [`api-error.ts`](../../client/src/transport/api-error.ts), with a message that's safe to show a user. [`identity.ts`](../../client/src/transport/identity.ts) is the small interface to the sign-in provider; see [signing-in-with-firebase.md](signing-in-with-firebase.md).
- **Endpoints:** [`src/endpoints/auth.endpoints.ts`](../../client/src/endpoints/auth.endpoints.ts) (`fetchCurrentUser`) and [`user.endpoints.ts`](../../client/src/endpoints/user.endpoints.ts) (`fetchUsers`, `fetchUserById`, `updateUserAccess`). Each one builds a request, calls `httpClient` and returns the whole `ApiResponse<T>` envelope. They never catch errors; the hook decides what an error means.
- **Hooks:** for example [`useUsers.ts`](../../client/src/hooks/useUsers.ts) owns one page of accounts: the request, `loading`, `error`, paging details and `refetch`. `loading` is *derived* (the stored result doesn't match the current request yet) rather than switched on at the start of an effect. React's lint rules flag the "set state at the top of an effect" pattern from the standard's example because it causes an extra render.
- **Components** ([`src/components/`](../../client/src/components/)) only render the props they're given. **Pages** ([`src/pages/`](../../client/src/pages/)) combine hooks and components.
- **Contexts** ([`src/contexts/`](../../client/src/contexts/)) hold the three truly app-wide concerns: `AuthContext`, `ThemeContext` and `ToastContext`. There's no Redux or Zustand (rule 19.8).

**Shared types mirror the backend.** [`src/types/api.types.ts`](../../client/src/types/api.types.ts) is the backend's envelope, `{ success, data, message, errors?, meta? }`, field for field. [`auth.types.ts`](../../client/src/types/auth.types.ts) and [`user.types.ts`](../../client/src/types/user.types.ts) copy the backend's `AuthUser` and `UserDto`. The backend's `meta` only sends `page`, `pageSize`, `total` (and `nextCursor`), so [`src/utils/pagination.ts`](../../client/src/utils/pagination.ts) works out `totalPages`, `hasNext` and `hasPrev` in one place (standard section 4).

**Configuration.** [`src/config/env.ts`](../../client/src/config/env.ts) checks the `VITE_` settings with Zod when the app starts. [`src/main.tsx`](../../client/src/main.tsx) shows a "this app isn't configured yet" screen listing what's missing, and only loads the rest of the app once the check passes. Copy [`.env.example`](../../client/.env.example) to `.env`:

| Variable | What it is |
|---|---|
| `VITE_API_URL` | The backend's address, e.g. `http://localhost:4000` (no `/api/v1`) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | From the Firebase console → Project settings → *Your apps* → Web app. Use the **same Firebase project** as the server's `FIREBASE_PROJECT_ID`, or the backend will reject every token |

Everything starting with `VITE_` is copied into the JavaScript that browsers download, so it's public. Never put a secret there. The Firebase web API key identifies the project; it isn't a password.

**Routing.** [`src/routes.tsx`](../../client/src/routes.tsx) defines the screens, and each page is loaded only when first visited (`React.lazy`, standard section 13). [`RouteErrorPage.tsx`](../../client/src/pages/RouteErrorPage.tsx) catches a crashed screen or a page file that failed to download, which often happens right after a new deploy, and offers a reload.

**Lint rules that enforce the standard.** [`eslint.config.js`](../../client/eslint.config.js) turns several of section 19's rules into build errors:

| Rule | Enforced by |
|---|---|
| 19.1: components/pages never call the API | `no-restricted-imports`: `src/components/**` and `src/pages/**` can't import `endpoints/` or `transport/http`; hooks can't import `transport/http` |
| 19.3: never handle tokens by hand | Only `src/transport/` may import `axios` or `firebase` |
| 19.7: no native dialogs | `no-alert`, plus `alert`/`confirm`/`prompt` banned as globals |
| 19.10 / section 18: file size limits | `max-lines` per folder: pages 1000, components 700, hooks 150, endpoints 100, utils 150, contexts 200 |

Standard section 9's text says pages should stay under 200 lines, but its section 18 table says 1000. The lint uses the table; every page here is well under 200 anyway.

**Commands** (run inside `client/`):

```bash
npm install
cp .env.example .env     # then fill it in
npm run dev              # http://localhost:5173 (the backend's default CORS origin)
npm run typecheck        # app + Cypress specs
npm run lint
npm test                 # unit tests
npm run e2e              # Cypress, fully offline; see client-testing.md
npm run build            # typecheck + production build into dist/
```

## Resources to read

- Vite, getting started: https://vite.dev/guide/
- Vite env variables and modes: https://vite.dev/guide/env-and-mode
- React, passing data deeply with context: https://react.dev/learn/passing-data-deeply-with-context
- React, you might not need an effect (why `loading` is derived): https://react.dev/learn/you-might-not-need-an-effect
- React, `lazy` (code splitting): https://react.dev/reference/react/lazy
- React Router, data routing: https://reactrouter.com/start/data/routing
- Axios interceptors: https://axios-http.com/docs/interceptors
- Zod: https://zod.dev
- ESLint configuration files: https://eslint.org/docs/latest/use/configure/configuration-files
- ESLint `no-restricted-imports`: https://eslint.org/docs/latest/rules/no-restricted-imports
- typescript-eslint: https://typescript-eslint.io/getting-started/

## Explain it like I'm new to this

Picture a restaurant. The **page** is the dining room: it decides what goes on the table. The **hook** is the waiter who takes one table's order, keeps track of whether the food is coming, and tells you if the kitchen ran out. The **endpoint** is the order ticket, a fixed, printed form for each dish, so nobody shouts a vague "bring me something" at the kitchen. The **transport** is the one pass-through window to the kitchen, and it's the only place where your ID (the Firebase token) is shown. The lint rules are the restaurant manager: if a waiter tries to walk into the kitchen and cook, or a diner tries to shout straight through the window, the manager stops it before the restaurant opens.
