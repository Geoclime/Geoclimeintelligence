# Deploying the Client to Vercel

## What was built

A configuration file, [`client/vercel.json`](../../client/vercel.json), that lets **Vercel** build the web client and serve it on the internet. After a one-time setup, every push to GitHub that changes the client builds and publishes a new version, and every pull request gets its own preview address.

## How it works

**1. What `vercel.json` sets:**

| Setting | Value | Why |
|---|---|---|
| `framework` | `vite` | Tells Vercel what kind of project this is |
| `installCommand` | `CYPRESS_INSTALL_BINARY=0 npm ci` | Installs packages exactly as locked, but skips downloading Cypress's ~500 MB test browser, which a build doesn't need |
| `buildCommand` | `npm run lint && npm test && npm run build` | **Blocks the deploy** if lint, the unit tests or the typecheck fail, then builds into `dist/` |
| `outputDirectory` | `dist` | Where Vite puts the finished site |
| `rewrites` | everything → `/index.html` | This is a single-page app: `/admin/users` isn't a real file. Vercel serves real files (like `/assets/…`) first and hands every other path to `index.html`, where React Router takes over. Without it, refreshing on `/admin/users` would give a 404 |
| `headers` | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` | Basic browser hardening: the app can't be framed by another site (clickjacking) |
| `headers` on `/assets/*` | `Cache-Control: …immutable` | Vite gives every built file a content hash in its name, so browsers can cache them forever. `index.html` itself isn't cached that way, so a new deploy is picked up straight away |

**2. First-time setup (once):**
1. In Vercel: **Add New → Project**, import the GitHub repository.
2. Set **Root Directory** to `client`. The repository holds both `server/` and `client/`, and Vercel should only build the client. Vercel then reads `client/vercel.json`.
3. Under **Environment Variables**, add the same keys as [`client/.env.example`](../../client/.env.example):
   - `VITE_API_URL`: the Render API's address, e.g. `https://geoclime-api.onrender.com` (see [deployment-render.md](../deployment-render.md)).
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`: from the Firebase console, for the **same** Firebase project the API uses.

   Vite copies these into the built JavaScript *at build time*, so after changing one you must **redeploy**. None of them is secret.
4. Deploy. Note the address Vercel gives you, e.g. `https://geoclime.vercel.app`.
5. **Allow that address on the API.** In the Render dashboard, set the API's `CORS_ORIGINS` to the Vercel address (comma-separate several, e.g. the production domain and `http://localhost:5173`). Without this, the browser blocks every API call and the app shows "We couldn't reach the server".
6. **Allow it in Firebase.** Firebase console → Authentication → Settings → **Authorized domains**: add the Vercel domain. Email/password sign-in works without it, but links in password-reset and verification emails, and any later Google sign-in, need it.

**3. After that,** pushes to `main` deploy to production and other branches get preview URLs. Preview URLs change per branch, so they won't be in `CORS_ORIGINS` and their API calls will be blocked. Either test previews against a local API, or add a stable preview domain to `CORS_ORIGINS`.

**Checked before committing:** the production build succeeds, with lint, unit tests and typecheck passing. I couldn't run a real Vercel deploy from this machine; Vercel validates `vercel.json` on the first deploy and names any field it rejects.

**Flagged for the team (NEEDS VERIFICATION):**
- **Cold starts.** The API's free Render plan sleeps after about 15 minutes without traffic. The client retries reads for a few seconds and waits up to 20 seconds per request, but the first visit after a quiet spell can still show "We couldn't load your account" with a **Try again** button. A paid API plan removes this.
- **Content-Security-Policy** isn't set yet. A CSP must allow the API address and Firebase's hosts (`*.googleapis.com`, the auth domain), and later Mapbox. Add it once the production domains are settled.
- Standard section 1 puts infrastructure under the Cloud Engineer, so this setup should be reviewed by them.

## Resources to read

- Vercel project configuration (`vercel.json`): https://vercel.com/docs/project-configuration
- Vite on Vercel: https://vercel.com/docs/frameworks/frontend/vite
- Monorepos and the Root Directory setting: https://vercel.com/docs/monorepos
- Environment variables: https://vercel.com/docs/environment-variables
- Rewrites: https://vercel.com/docs/rewrites
- Headers: https://vercel.com/docs/headers
- Git deployments and previews: https://vercel.com/docs/deployments/git
- Vite env variables (why a redeploy is needed): https://vite.dev/guide/env-and-mode

## Explain it like I'm new to this

The API on Render is the kitchen; the client on Vercel is the printed menu handed to every customer. Vercel prints a fresh menu every time the recipe book on GitHub changes, but only after the proof-reader (lint and tests) signs it off. The menu has the kitchen's phone number printed on it (`VITE_API_URL`), which is why changing the number means reprinting (redeploying). And the kitchen only takes orders from menus it recognises (`CORS_ORIGINS`), so after printing the first menu you have to tell the kitchen "this menu is ours".
