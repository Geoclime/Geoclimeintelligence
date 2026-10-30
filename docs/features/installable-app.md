# The Installable App (PWA)

## What was built

GeoClime Intelligence can be installed like an app on phones and computers, and keeps working on a poor or lost connection.

- **Install:**
  - *Chrome, Edge and Android:* an **Install app** button appears where the browser allows it: the public header on wide screens, the footer, and Profile → Preferences.
  - *iPhone:* Safari's Share → Add to Home Screen.

  The installed app opens in its own window with the GeoClime icon. A long-press on the icon shows shortcuts to **Flood alerts**, **Report flooding** and the **Map**.
- **Offline:** after one visit, the app opens without a connection and moves between pages. The public alert map and place finder show their last answers, and the existing offline banner says what you see may be out of date. Signed-in data is never stored offline.
- **Updates:** a new release downloads in the background. A card then offers *Reload*, so nobody loses a half-written flood report to an automatic refresh.

## How it works

All paths are relative to `client/`.

**1. The manifest** (`public/manifest.webmanifest`) gives the name, colours, `standalone` display, the shortcuts and the icons:
- `public/icons/`: 192 and 512 px, plus "maskable" versions with the logo inside the safe zone, so Android can crop them to any shape;
- `apple-touch-icon.png` for iOS.

`index.html` links it and adds the iOS meta tags.

**2. The service worker** (`public/sw.js`) is hand-written rather than generated, so exactly what is cached is visible in one file:

| Request | Strategy |
|---|---|
| Pages (navigations) | Network first (6 s), then the cached app shell |
| `/assets/*` (hashed build files) | Cache first; the newest 120 kept |
| Icons, manifest, Google Fonts | Cached, refreshed in the background |
| `/api/v1/public/*` without a sign-in token | Network first, the last good answer offline |
| Everything else (signed-in API, Firebase, Mapbox) | Never cached |

On install it caches `/` and the scripts and styles that page names, so the app opens offline after one visit. Bump `VERSION` in `sw.js` when its behaviour changes; old caches are deleted on activate.

**3. Registration** (`src/pwa/pwa-store.ts`, started from `main.tsx`) happens in production builds only, never in `vite dev` or Cypress. It also:
- keeps Chrome's `beforeinstallprompt` event for the Install button;
- checks for a new version every hour;
- reloads once the user accepts an update.

`hooks/usePwa.ts` reads the store; `PwaUpdateBanner` and `InstallAppButton` use it.

**4. Hosting** (`vercel.json`): `/sw.js` is served `Cache-Control: no-cache`, so browsers always see a new worker, and the manifest with its proper content type.

**Checked:** in Chrome against a production build:
- the worker activates;
- the shell, assets and icons are cached;
- `Page.getInstallabilityErrors` returns none;
- with the network off, `/about` still opens.

## Resources to read

- web.dev, "Learn PWA": https://web.dev/learn/pwa/
- MDN, "Service Worker API": https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
- web.dev, "Maskable icons": https://web.dev/articles/maskable-icon

## Explain it like I'm new to this

A normal website forgets everything when the connection drops. The service worker is a small helper the browser keeps beside the site. It saves a copy of the app's frame and its code the first time you visit. Next time, even with no signal, it hands the browser that saved copy so the app still opens. It is careful never to keep anyone's private data, only the parts that are the same for everyone.
