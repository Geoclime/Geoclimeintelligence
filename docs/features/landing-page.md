# The Public Landing Page

## What was built

`/` is now a public landing page, open signed in or out. The map moved to **`/map`**.

Sections, in order:
1. **Header.** The brand, links to the page's sections (a menu on phones), the theme switch, and *Sign in* / *Create account*. A signed-in visitor sees *Open the map* instead.
2. **Hero.** The headline, *Check your area* and *Create a free account* buttons, live facts ("23 LGAs · 317 Wards · Rainfall since January 2016") and an SVG outline of the state's LGAs. Hover an LGA for its name; click to look it up.
3. **Check your area.** No account needed. Search an LGA, ward or community, or press *Use my location*. The summary shows:
   - where the area sits;
   - the latest month and the last 12 months against their usual level, with the 12-month chart;
   - links to the full profile and the map.

   It says plainly that rainfall alone is not a flood forecast. It also gives the emergency number, 112.
4. **What you can do.** Three cards: the map, places, rainfall.
5. **What's on the map today.** Live counters: LGAs, wards, months of rainfall, communities, facilities, buildings, roads and waterways.
6. **Who it's for.** Responders, officials, researchers, residents.
7. **Data sources.** Every source, with a link and its licence.
8. **Closing call to action**, then the **footer** with the OpenStreetMap credit.

Nothing on the page advertises a feature that doesn't exist yet (standard section 17.1). Flood risk and alerts are not mentioned until they ship.

**Nigeria-wide, starting with Rivers State.** The platform presents itself as covering Nigeria, and it is built around countries and their levels so it can grow across Africa. Where it says which states are live, that comes from the data: the overview's `states` list gives the hero line "Live in Rivers State", and it updates as each state is loaded. Map, places and profile wording is generic ("states, LGAs and wards", "All regions"), and the sign-in panel and site details describe Nigeria.

**Information pages**, all public and sharing the landing page's header and footer:

| Page | Covers |
|---|---|
| `/about` | Mission, what the platform does, how we work (sources, honesty about uncertainty, privacy, roles), our data |
| `/contact` | Emergency number first, then email by purpose (general, data, problems, privacy), and the office |
| `/accessibility` | WCAG 2.2 AA target, what works, known limitations (the map, the outline), how to report a problem |
| `/privacy` | What is collected (account, location, logs, browser storage), why, the processors (Firebase, Mapbox, Vercel, Render, Aiven), retention and rights under the Nigeria Data Protection Act 2023 |
| `/terms` | Not an emergency service, the limits of the information, data licences, accounts, acceptable use, liability, Nigerian law |

The sign-up form links to the terms and privacy policy, and the sign-in panel's logo links home.

> **Placeholders.** The organisation's email addresses, phone number and office address on these pages are stand-ins. They all live in `client/src/config/site.ts`, so replacing them there updates every page. Do this before a public launch, and have the privacy policy and terms reviewed by someone qualified before relying on them.

## How it works

All paths are relative to `client/src/`. The server side is in [public-landing-api.md](../public-landing-api.md).

**1. Routes.** In `routes.tsx` the landing page and the five information pages are children of `components/layout/PublicLayout.tsx`, outside both `GuestOnly` and `RequireAuth`. The layout renders the header, footer and skip link. It scrolls to the top on a new page, or to the section in a link like `/#sources`, also when that link comes from another page. The content pages share `components/landing/InfoPage.tsx`: a title band, an "On this page" list on wide screens, and an anchor on every section. The map is `path: "map"` inside `AppShell`. Every in-app link that meant "the map" now uses `MAP_PATH` from `utils/map-url.ts`:
- the top bar and sidebar brand;
- the *Map* nav item;
- the not-found and no-access pages;
- the profile quick links, *Show on map*, the Help page and the import screen.

After sign-in with no destination, `GuestOnly` sends people to `/map`.

**2. Old links keep working.** Map links used to look like `/?lng=…&lat=…&z=…&lga=…`. `LandingPage` checks `isMapLink(params)` and forwards any such address to `/map` with the same parameters.

**3. Data.** `endpoints/public.endpoints.ts` calls the five public routes. The hooks are `usePublicOverview`, `usePublicOutline`, `usePublicSearch` (only from 2 characters, debounced 250 ms) and `usePublicArea`. `useLocatePoint("public")` reuses the existing locate hook against the public route. The overview, outline and areas are cached under `CACHE_KEYS.public`, which imports clear.

**4. The outline** (`components/landing/StateOutline.tsx`) is plain SVG, not Mapbox, so the landing page costs no map load. `utils/outline-path.ts` fits the bbox to the drawing and scales longitude by the cosine of the middle latitude. Near the equator that is accurate to well under a pixel. Clicking an LGA is pointer-only; keyboard users get the same result from the search box, so the 23 shapes aren't 23 tab stops.

**5. The place finder** (`PlaceFinder.tsx`) is an ARIA combobox: arrow keys, Enter and Esc work. Choosing a community or *Use my location* asks the server which LGA contains the point, then shows that LGA. The summary leads with the LGA, because the GRID3 ward placeholders don't always sit inside the geoBoundaries LGA that contains the point. The location is used once and never stored.

**6. Styling.** `components/landing/landing.css` uses the app's tokens, so light and dark themes work, at a roomier 16px body size. The hero and closing band are always deep teal, like the sign-in brand panel. It is mobile-first, with breakpoints at 640px and 960px.

**Tests:**
- `utils/outline-path.test.ts` and `isMapLink` in `utils/map-url.test.ts` (unit).
- `cypress/e2e/landing/landing.cy.ts`: signed-out render, search to summary, community to LGA and ward, outline click, overview failure, the signed-in header, and old-link forwarding.
- The map specs now visit `/map`.
- `npm run e2e` and `npm run cy:open` go through `client/scripts/cypress.mjs`. It clears `ELECTRON_RUN_AS_NODE`, which VS Code's terminal sets and which otherwise stops Cypress from starting ("bad option: --smoke-test").

## Resources to read

- WAI-ARIA Authoring Practices, "Combobox pattern": https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- MDN, "SVG paths": https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
- OpenStreetMap, "Copyright and licence" (the attribution in the footer): https://www.openstreetmap.org/copyright

## Explain it like I'm new to this

Before, the app's front door was locked: anyone arriving was sent straight to sign in. Now there's a lobby. It explains what the platform is, shows live numbers, and lets anyone type a place name and see roughly where it is and how wet it has been. The full map and profiles are still through the locked door. The lobby just shows you why it's worth going in.
