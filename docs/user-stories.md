# User Stories: a Hands-On Walkthrough of Phases 1 and 2

Everything the platform can do so far, written as user stories you can follow one by one in the running app. Each story says **who** it's for, **what** they want and **why**, then gives the **steps** to try it and **what you should see**. Tick the box when it works.

The stories are in the order you'd naturally go through them: set up, become the first administrator, load Rivers State's boundaries, explore them, then manage other people's access. Stories marked *(error case)* deliberately try something that should be refused.

**Who's who.** The platform has five roles: General Public, Emergency Responder, Government Official, Researcher and Administrator. Every new account starts as General Public. To test as different roles, sign up with a few email addresses and change their roles in story 6.2.

---

## 0. Before you start

**0.1 Run the API**
1. In `server/.env`, set `DATABASE_URL`, `DATABASE_SSL`, `DATABASE_SSL_CA`, `FIREBASE_PROJECT_ID`, `CORS_ORIGINS=http://localhost:5173`, and **`BOOTSTRAP_ADMIN_EMAIL=<the email you'll sign up with>`**.
2. `cd server`, then `npm run migration:run`. On the Aiven database these have already been applied; it should say there's nothing to run.
3. `npm run dev`. Open http://localhost:4000/health and you should see `{"success":true,"data":{"status":"ok"},"message":"OK"}`.

**0.2 Run the web app**
1. In `client/.env`, set `VITE_API_URL=http://localhost:4000`, the four Firebase web settings, and `VITE_MAPBOX_TOKEN`.
2. `cd client`, then `npm run dev`, then open http://localhost:5173.

- [ ] The sign-in page appears. If a setting is missing, you'll instead see "This app isn't configured yet" with the missing names listed.

**0.3 Have the data files ready.** They're in `C:\Desktop\ClimateSoftware`:
- `rivers_state_boundary.geojson`
- `rivers_state_rainfall_and_boundaries.xlsx`
- `rivers_state_wards.geojson`
- `README_rivers_state_boundaries.md` and `README_rivers_state_wards_settlements.md`, for the source details.

---

## 1. Accounts and signing in (Phase 1)

### 1.1 Create an account
*As a new visitor, I want to create an account with my email and a password, so that I can use the platform.*
1. On the sign-in page, choose **Create an account**.
2. *(error case)* Type two different passwords and submit. You should see an inline "passwords must match" error, and nothing is sent.
3. *(error case)* Try a password under 8 characters. You should see "Use at least 8 characters".
4. Enter the email you put in `BOOTSTRAP_ADMIN_EMAIL` and a good password, then submit.
- [ ] A success message says a verification link was sent.
- [ ] You land on the **map** (the home screen).
- [ ] A yellow banner across the top says **"Verify your email address"**, with a **Resend link** button.

### 1.2 Verify my email
*As a new user, I want to confirm my email address, so that an administrator can trust who I am.*
1. Open the verification email and click the link.
2. Come back to the app's tab (no reload needed).
- [ ] The verify banner disappears by itself within a moment of returning to the tab.

### 1.3 Become the first administrator
*As the person setting up the platform, I want my own account to become the first Administrator without touching the database, so that I can manage everything else from the app.*
1. With your email verified, reload the page.
- [ ] The **Administration** group (Users, Countries, Imports) appears in the sidebar.
- [ ] The account menu (your initials, top right) shows the role **Administrator**.
- [ ] This only works with a **verified** email, and only while no administrator exists. Once you're an admin, the setting does nothing more. If it ever doesn't apply, the fallback is `npm run user:set-access -- --email you@example.com --role administrator` in `server/`.

### 1.4 Sign out and sign back in
*As a user, I want to sign out and in again, so that nobody else can use my session on a shared computer.*
1. Account menu, then **Sign out**. You should land on the sign-in page with a "signed out" message.
2. *(error case)* Sign in with the wrong password. You should see "That email and password don't match an account". The message never says which of the two was wrong.
3. Use the eye icon to show and hide the password.
4. Sign in correctly.
- [ ] You're back on the map, still Administrator.

### 1.5 Come back where I was going
*As a user who opened a bookmarked page while signed out, I want to land on that page after signing in, so that I don't have to find it again.*
1. Sign out. Paste http://localhost:5173/admin/users into the address bar.
2. You're sent to sign-in. Sign in.
- [ ] You land on **Users**, not the map.

### 1.6 Reset a forgotten password
*As a user who forgot their password, I want a reset email, so that I can get back in.*
1. On sign-in, choose **Forgot password**, enter your email and submit.
2. *(error case)* Try an email that has no account.
- [ ] Both show the same "check your inbox" confirmation, so the page never reveals whether an account exists.
- [ ] The real email arrives with a reset link (the Firebase template described in `docs/features/auth-email-templates.md`).

### 1.7 Personal touches
*As a user, I want the app to remember my theme and tell me when I'm offline, so that it's comfortable to use in the field.*
1. Account menu, then **Theme**, then choose dark. Reload the page.
2. Turn off your Wi-Fi.
3. Visit a made-up address such as http://localhost:5173/nothing-here.
- [ ] After the reload, the theme is still dark.
- [ ] With Wi-Fi off, an "You're offline" banner appears; it goes away when you reconnect.
- [ ] The made-up address shows "We couldn't find that page" with a way back.

### 1.8 See my own access
*As any user, I want to see my role and region, so that I know what I can do.*
1. Account menu, then **Your account and access**.
- [ ] Your role, what it allows, and your region ("All of Rivers State" if you have no scope) are shown.

---

## 2. Setting up the geography (Phase 2, Administrator)

### 2.1 Be guided to set up the first country
*As the first administrator, I want the empty map to tell me what to do next, so that I don't face a blank screen.*
1. Open the map (**Map** in the sidebar) before any country exists.
- [ ] A card says **"Set up your first country"**, with a button.
- [ ] Signed in as a non-admin, the same screen says "No map data yet", with no button.

### 2.2 Create Nigeria
*As an administrator, I want to add a country with its own names for its levels, so that areas can be loaded under it.*
1. Click **Set up your first country**, or go to **Countries**, then **Add country**.
2. Fill in:
   - **ISO code:** `NGA`
   - **Name:** Nigeria
   - **Levels:** State, then **Add a level**, LGA, then **Add a level**, Ward
   - **Rough bounding box:** West `2.5`, South `4.0`, East `14.8`, North `14.0`
3. *(error case)* First try the code `NG`, or two levels with the same name. You should see inline errors.
4. Click **Create country**.
- [ ] You land on Nigeria's page with three level cards, each saying "None loaded yet".
- [ ] *(error case)* Adding `NGA` a second time is refused with "A country with code NGA already exists".

> **What is the "rough bounding box"?**
>
> Picture drawing a rectangle on the map that just fits around Nigeria. The four boxes are that rectangle's four edges, measured in degrees (the same numbers as GPS coordinates):
>
> | Box | Which edge | Nigeria's actual edge | Type |
> |---|---|---|---|
> | West | the left side (a longitude) | about 2.7° E, the border with Benin | `2.5` |
> | South | the bottom (a latitude) | about 4.3° N, the coast at the Niger Delta | `4.0` |
> | East | the right side (a longitude) | about 14.7° E, the border with Cameroon | `14.8` |
> | North | the top (a latitude) | about 13.9° N, the border with Niger | `14.0` |
>
> The numbers are slightly wider than Nigeria on purpose, so nothing real is cut off. Rivers State (longitude 6.4 to 7.6, latitude 4.3 to 5.7) sits comfortably inside.
>
> *Checked on 2026-10-06 against Nigeria's national boundary from geoBoundaries (gbOpen, NGA ADM0, CC BY 4.0): its real edges are West 2.6926, South 4.2702, East 14.6780, North 13.8857. The suggested box leaves a margin of 0.11° to 0.27° (about 12 to 30 km) on every side.*
>
> **Why it's there:** it's a safety net for imports. Every shape in an uploaded file must fall inside this rectangle. If a file has a mistyped coordinate (`70.0` instead of `7.0`), a minus sign where there shouldn't be one, or a shape from another country, that row fails its checks and never goes live. Story 2.9 shows it happening.
>
> **What it doesn't do:** it's a rectangle, not Nigeria's real border, so a shape that's wrong but still somewhere inside the rectangle passes this check. For example, latitude and longitude swapped for Port Harcourt (`4.8, 7.0` instead of `7.0, 4.8`) still lands inside Nigeria. Those mistakes are caught by your eye on the review map in 2.5–2.7, and by a warning when an area's middle isn't inside its parent.
>
> **If you leave it empty:** imports still work, this check is skipped, and every import shows a reminder that the country has no box. You can add it later under **Countries → Nigeria → Edit**.

### 2.3 Record where the data comes from
*As an administrator, I want to record each dataset's provider, link, licence and download date, so that every boundary on the platform can be traced to its source.*
1. Go to **Imports**, then **New import**, then **Add a source**. Enter geoBoundaries:
   - **Provider:** geoBoundaries (William & Mary geoLab)
   - **Dataset:** gbOpen NGA ADM1 and ADM2, Rivers State subset
   - **Website:** https://www.geoboundaries.org
   - **Licence:** CC BY 4.0
   - **Downloaded on:** 2026-09-22
2. **Add a source** again, for GRID3:
   - **Provider:** GRID3
   - **Dataset:** GRID3 NGA - Operational Wards v1.0
   - **Website:** https://data.grid3.org/datasets/0824aded5f5a4d39b10871c667aa8ccf/about
   - **Licence:** CC BY 4.0
   - **Downloaded on:** 2026-09-22
   - **Notes:** Operational Placeholder ward boundaries
3. *(error case)* Try a website without `https://`, or a date in the future.
- [ ] Each new source is selected automatically in the **Data source** box.
- [ ] The bad website and the future date are refused with clear messages.

### 2.4 Download a blank template
*As an administrator, I want a ready-made template for a level, so that anyone preparing a file uses the right columns and real parent names.*
1. On **New import**, choose Nigeria and level **2. LGA**.
2. Click **Excel template**, then **GeoJSON sample**.
- [ ] The Excel file has three sheets: **Areas** (`unit_name`, `unit_code`, `parent_code`, `geometry_wkt`), **Instructions** (plain words and one example row), and **Parent areas** (the valid parents; empty until the state is loaded).
- [ ] The GeoJSON sample has an empty `features` list, so uploading it unchanged imports nothing.

### 2.5 Load the state outline (level 1)
*As an administrator, I want to load Rivers State's outline, so that the LGAs have a parent to belong to.*
1. **New import**: country Nigeria, level **1. State**, source geoBoundaries.
2. Upload `rivers_state_boundary.geojson`.
3. Check the column match: name = `shapeName`, code = `shapeISO`. The shape comes from the file itself.
4. Click **Check the file**.
- [ ] The review screen shows 1 row and 1 passed, and the outline appears on the preview map.
- [ ] Nothing is live yet: the Countries page still says State "None loaded yet".
5. Click **Promote 1 areas**, then **Promote** in the confirmation box.
- [ ] A success message appears, and the button changes to **Promoted**.

### 2.6 Load the 23 LGAs straight from Excel (the official Phase 2 test)
*As an administrator, I want to import the LGA sheet exactly as delivered, so that nobody has to convert it to GeoJSON by hand.*
1. **New import**: Nigeria, level **2. LGA**, source geoBoundaries.
2. Upload `rivers_state_rainfall_and_boundaries.xlsx`.
3. Set **Sheet** to `lga_boundaries`. The app finds the headings in **row 2**, under the title banner, and shows the first rows.
4. Check the column match:
   - name = `lga_name_standard`
   - code = `adm2_pcode`
   - parent = `state` (from a column)
   - shape = `geometry_wkt (EPSG:4326)`
5. **Check the file**.
- [ ] 23 rows, 23 passed, 0 failed. The preview map shows all 23 LGAs.
6. Promote.
- [ ] Nigeria's page now shows **LGA: 23 areas**.

### 2.7 Load the 318 wards (level 3)
*As an administrator, I want to load the wards from a different provider, linked to their LGAs even though that file spells LGA names differently.*
1. **New import**: Nigeria, level **3. Ward**, source GRID3. Upload `rivers_state_wards.geojson`.
2. Check the column match: name = `wardname`, code = `wardcode`, parent = `lganame`.
3. **Check the file**.
- [ ] 318 rows, **317 passed, 1 failed**.
- [ ] Filter **Failed**. The failed row is **row 62, "Omward 5"**, with the reason "The shape is missing": the source file genuinely has no shape for it.
- [ ] Wards whose LGA is spelled differently in this file (Obio/Akpor, Emuoha, Omumma, Port-Harcourt) are still matched to the right LGA.
4. Promote.
- [ ] The confirmation box mentions the 1 failed row will be left out. Afterwards Nigeria shows **Ward: 317 areas**.

### 2.8 Nothing gets loaded twice *(error case)*
*As an administrator, I want a repeated upload to be caught, so that the live data never gets duplicates.*
1. Import the LGA sheet again, exactly as in 2.6, and check it.
- [ ] All 23 rows fail with "already exists under this parent" and "Code … is already used". Promote is disabled ("Nothing passed").
2. Open any promoted import and try to promote it again (for example in Postman, story 7).
- [ ] It's refused: "This import has already been promoted".

### 2.9 Fix and re-upload a bad file *(error case)*
*As an administrator, I want rows with problems explained, so that I can fix the file instead of guessing.*
1. On **New import**, choose Nigeria and level **3. Ward**, and download the **Excel template**. Its **Parent areas** sheet lists the 23 LGAs with their codes.
2. In the **Areas** sheet, add two rows:

   | unit_name | unit_code | parent_code | geometry_wkt |
   |---|---|---|---|
   | `Test Ward A` | `TEST-A` | `Lagos Island` | `POLYGON((7.00 4.80, 7.01 4.80, 7.01 4.81, 7.00 4.81, 7.00 4.80))` |
   | `Test Ward B` | `TEST-B` | `NG033022` | `POLYGON((70.00 4.80, 70.01 4.80, 70.01 4.81, 70.00 4.81, 70.00 4.80))` |

   Row A is a real spot in Port Harcourt with a parent that doesn't exist. Row B points at Port Harcourt's real code, but its longitude has a typo: `70.0` instead of `7.0`, which puts it in the Indian Ocean.
3. Upload it with source geoBoundaries (any source will do), keep the suggested column match, and click **Check the file**.
- [ ] Row A fails: `No LGA called or coded "Lagos Island" exists yet`.
- [ ] Row B fails: `The shape lies outside NGA's bounding box. Check its coordinates…` (this is the rectangle from 2.2 doing its job).
- [ ] Promote is disabled ("Nothing passed"), so neither row can reach the live data. Don't promote anything here.
4. *(error case)* Upload a `.csv` file. You should see "Upload an Excel workbook (.xlsx) or a GeoJSON file".

### 2.10 See every past import
*As an administrator, I want a history of imports, so that I can see who loaded what and when.*
1. Go to **Imports**.
- [ ] Every run is listed with its file, level, source, "passed/total", status badge, who ran it and when. Each one opens its review screen.

### 2.11 Rename a level safely
*As an administrator, I want to rename a level without losing data, so that wording can change later.*
1. Go to **Countries**, then **Nigeria**, then **Edit**. Change "LGA" to "Local Government Area" and save. Then change it back.
- [ ] The code field is locked.
- [ ] The remove buttons for levels that hold areas are disabled.
- [ ] Every LGA picks up the new name.

---

## 3. Exploring the map and places (Phase 2, everyone signed in)

### 3.1 See Rivers State on the map
*As any signed-in user, I want a map of Rivers State and its LGAs, so that I can find my way around the data.*
1. Open **Map** in the sidebar.
- [ ] The map fits Rivers State: the state outline, all 23 LGA boundaries, and LGA names.
- [ ] The overview card says "Rivers State" and "23 LGAs · 317 Wards".
- [ ] The legend credits geoBoundaries and GRID3.

### 3.2 Zoom in to see wards
*As a user, I want wards to appear only when I zoom in, so that the map stays readable.*
1. Zoom in on Port Harcourt (scroll, or use +).
- [ ] Dashed ward boundaries appear from zoom 10. Before that, the Wards layer says "Zoom in to see wards".
- [ ] Untick **LGAs** or **Wards** in the Layers panel; that layer disappears.
- [ ] The Layers panel lists only State, LGAs and Wards, no empty placeholder layers.

### 3.3 Click anywhere to find out where it is
*As a user, I want to click a spot and be told its state, LGA and ward, so that I can place a location quickly.*
1. Click inside Port Harcourt.
- [ ] A popup lists **State: Rivers, LGA: Port Harcourt, Ward: …**, with links.
- [ ] That LGA is highlighted, and the overview card shows it with a **Profile** button.
2. *(error case)* Click in the sea outside the state.
- [ ] The popup says "This spot is outside every mapped area".

### 3.4 "Where am I?"
*As a responder in the field, I want my own LGA and ward from my phone's location, so that I don't need to read a map.*
1. Click **Where am I?** and allow location access.
- [ ] The map moves to you and shows your state, LGA and ward. Outside Rivers State it says you're outside every mapped area.
2. *(error case)* Block location access in the browser and try again.
- [ ] A clear message explains that permission was denied.

### 3.5 Share exactly what I'm looking at
*As a user, I want to send a link that opens the same view, so that a colleague sees what I see.*
1. Pan, zoom, select an LGA, and untick a layer. Copy the address bar (it contains `lng`, `lat`, `z`, `lga`, `layers`).
2. Open the link in a new tab or another browser.
- [ ] Same position, zoom, selected LGA and layers.

### 3.6 Browse the LGA directory
*As a user, I want a searchable list of LGAs, so that I can find one without the map.*
1. Go to **Places**. Type `obio` in the search box.
- [ ] All 23 LGAs are listed with code and ward count.
- [ ] The search narrows the list as you type.

### 3.7 Open an LGA's profile
*As a user, I want one page per LGA, so that I can see its outline, wards and source together.*
1. Open **Port Harcourt**.
- [ ] A small map outlines the LGA with its wards dashed.
- [ ] The page shows the code `NG033022` and the centre coordinates.
- [ ] The **Source** card (geoBoundaries, licence, download date) is shown.
- [ ] The wards are listed as links.
- [ ] A card honestly says rainfall and flood history arrive later, with no placeholder numbers.
- [ ] **Show on the main map** opens the map with this LGA selected.

### 3.8 Open a ward
*As a user, I want a ward page, so that I can see it inside its LGA.*
1. From the profile, click a ward.
- [ ] The ward is drawn inside its LGA's outline, with its code, parent LGA, and GRID3 source.
- [ ] The source's note says these are placeholder boundaries.
- [ ] The breadcrumbs read Places / Port Harcourt / ward name.

---

## 4. Managing people's access (Phases 1 and 2, Administrator)

### 4.1 See every account
*As an administrator, I want a list of accounts, so that I know who has joined.*
1. Ask a colleague to sign up, or sign up a second email in a private window. Then open **Users**.
- [ ] Every account is listed with role, region and joined date.
- [ ] Your own row is marked **You**, and its **Edit access** button is disabled, so you can't lock yourself out.
- [ ] With more than 25 accounts, pages appear, and the page number stays in the address.

### 4.2 Give someone a staff role limited to one LGA
*As an administrator, I want to make someone an Emergency Responder for one LGA only, so that they can only act on records there.*
1. Find the LGA's id: open it under **Places**. The id is the long code in the address, after `/places/`.
2. In **Users**, click **Edit access** on the other account. Choose **Emergency Responder** and paste the id into **Region ID**. Save.
- [ ] A success message appears, and the row shows the new role.
3. Sign in as that person, then go to **Your account and access**.
- [ ] Region shows **"Limited to one region: Port Harcourt (LGA)"** by name.
4. *(error case)* Paste a made-up id, e.g. `11111111-1111-4111-8111-111111111111`.
- [ ] Refused next to the field: "No area with this id exists".
5. *(error case)* Choose **Researcher** for someone who has a region.
- [ ] The region field disappears and the region is cleared, because only responders and officials can be limited to a region.

### 4.3 Keep admin screens away from everyone else *(error case)*
*As the platform owner, I want non-admins kept out of admin screens, so that only administrators can change data or access.*
1. Signed in as a General Public or Government Official account, check the sidebar.
2. Type `/admin/users`, `/admin/countries` and `/admin/imports/new` into the address bar.
- [ ] The sidebar has no Administration group.
- [ ] Each typed address shows "You don't have access to this page". The API refuses the same requests with 403 regardless of the screen (story 7).

---

## 5. On a phone (Phase 2 layout)

### 5.1 Use the app on a small screen
*As a responder using a phone, I want every screen to fit, so that I can use it in the field.*
1. Open the app on a phone, or in the browser's device toolbar (F12, then the phone icon; try 360 px wide).
- [ ] The sidebar is hidden; a menu button (top left) slides it in.
- [ ] Choosing a link closes it, and so do tapping outside it or pressing Esc.
- [ ] On the map, the overview card sits at the top, and **Layers** opens the layer switcher and legend.
- [ ] Tables (Places, Users, imports) become stacked cards.
- [ ] No screen scrolls sideways.

---

## 6. Roles at a glance (for testing other roles)

### 6.1 What each role can do today

| Role | Can do in Phases 1–2 |
|---|---|
| General Public | Map, Places, own account |
| Emergency Responder / Government Official | Same, and can be limited to a region (used by Phase 4's disaster events) |
| Researcher | Same as General Public for now |
| Administrator | Everything, including Users, Countries, Imports and data sources |

### 6.2 Switch a test account's role
Use story 4.2 on a second account. Then sign in as it, or reload its tab, and it picks up the new role on its next request.

---

## 7. The API by hand (Postman)

*As a developer or tester, I want to call every endpoint directly, so that I can check behaviour without the app.*
1. Import `server/postman/climate-platform.postman_collection.json` and `local.postman_environment.json`.
2. Fill in `firebaseApiKey`, `email` and `password`, then run **Auth › Firebase: sign in**. This stores the token.
3. Open the **Admin Geography** folder. Each request has saved example replies for every outcome.
- [ ] **Admin units › Locate a point** (7.0134, 4.7774) returns Rivers > Port Harcourt > a ward.
- [ ] Locate with Lagos (3.3792, 6.5244) returns `404` "No mapped area contains this point".
- [ ] **Map layer (GeoJSON)** without `bbox` returns `400`. No layer is ever served without a visible area.
- [ ] **List admin units** returns names and codes only, never shapes.
- [ ] Signed in as a non-admin, **Create country** and any **Imports** request return `403`.
- [ ] **Start an import** with no file returns `400 Choose a file to upload`; with an unknown `sourceId`, `422`.

---

## 8. Phase 2 sign-off checklist

From the Phase 2 guide. All should be ticked after the stories above.

- [ ] `countries` and `admin_units` migrations ran on the database with no seed rows (story 0.1)
- [ ] GiST index on the shape column (`idx_admin_units_geom`; `\d admin_units` in `psql` lists it)
- [ ] `lga_boundaries` sheet imported through staging and promoted: 23 LGAs, no manual conversion (2.6)
- [ ] Nigeria created on the Countries page, then the state and the wards loaded through the same pipeline (2.2, 2.5, 2.7)
- [ ] Every area has a source (each place page shows its Source card)
- [ ] Locate returns the right LGA for Port Harcourt and an error outside the mapped area (3.3, 7)
- [ ] Lists return no shapes; the map endpoint needs a bbox (7)
- [ ] Non-admins refused on country writes and all imports (4.3, 7)
- [ ] Backend unit tests pass and `npm run typecheck` is clean (`cd server && npm test && npm run typecheck`)
- [ ] Postman "Admin Geography" covers every success and error; a downloaded template, filled and uploaded, imports cleanly (2.4, 7)
- [ ] Home map, LGA directory, LGA profile, the three admin country pages and the three admin import pages work, with Cypress tests (`cd client && npm run e2e`)
- [ ] `docs/admin-geography.md` and `docs/data-import.md` written

**Where to read more:** [admin-geography.md](admin-geography.md), [data-import.md](data-import.md), [features/admin-geography.md](features/admin-geography.md), [phase-1-authentication.md](phase-1-authentication.md), [user-management.md](user-management.md).
