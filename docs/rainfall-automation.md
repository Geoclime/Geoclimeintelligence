# Rainfall automation: getting the data on a schedule

**Status: planned, not built.** Today an administrator exports CHIRPS from Google Earth Engine by hand and uploads the file ([data-import.md](data-import.md), section 8). This page is what has to be done so the platform fetches rainfall by itself, and the other data work that follows. It was written 2026-10-29. Tick items off as they're done.

## Goal

New rainfall appears on the LGA pages without anyone exporting or uploading a file, and a problem is noticed instead of silently leaving the data stale.

Nothing about the safety rules changes: the job's rows still go through the same checks, and a run that looks wrong waits for an administrator instead of going live.

## What already exists (so it doesn't get rebuilt)

- The checks and the comparison with what is live: [`rainfall-rows.ts`](../server/src/modules/data-sources/imports/rainfall-rows.ts). They tell new months from filled, revised and unchanged ones, so **running the job twice is safe**.
- The check-then-promote run: staging, the all-or-nothing Promote, and the "changed since checked" guard.
- The `rainfall_observations` table and the read endpoint and card.
- A pattern for scripts that run outside the web server: [`load-map-layers.ts`](../server/src/scripts/load-map-layers.ts) (`npm run layers:load`), with `--dry-run`.

## 1. Decide how to get the numbers

The job has to turn "CHIRPS" into one number per LGA per period. There are two ways.

| | **A. Google Earth Engine from the server** | **B. Download CHIRPS files and compute it ourselves** |
|---|---|---|
| How | The server asks Earth Engine to average CHIRPS over each LGA (`reduceRegions`) and gets 23 numbers back | The server downloads CHIRPS GeoTIFFs from the Climate Hazards Center and averages the cells inside each LGA in code |
| Matches what you do today | Yes, it is the same tool | No: new code |
| Needs | A Google Cloud project registered for Earth Engine, a service account and its key, kept as a secret | Nothing from Google; the files are public |
| Code | Small (the `@google/earthengine` package) | Larger: read GeoTIFFs, mask polygons, handle the grid |
| Risk | Earth Engine's access and licence terms (commercial use may need a paid plan); keys to look after | More to maintain; polygon-on-grid details for small LGAs |
| Also gives | IMERG, ERA5-Land and other datasets with the same code | Only what you download |

**Recommendation:** A, since you already use Earth Engine. Choose B only if a service account or the licence terms are a problem. Check Google's current Earth Engine documentation for registration and non-commercial vs commercial terms before committing; they have changed over time.

- [ ] **Decide A or B**, and who owns the Google Cloud project (or the decision not to use it).

## 2. Make the numbers match the existing history

This matters more than it looks. The history you loaded came from an export that used its own LGA outlines (the `ADM2_*` columns) and its own way of making a month from daily data. If the job uses different outlines or a different method, new months will differ slightly from old ones, and a re-fetch of an overlapping month will show up as "revised".

- [ ] **Find out exactly how the original export computed `mean`** (monthly sum of daily CHIRPS, then the average over the LGA?) and which boundaries it used.
- [ ] **Have the job read the LGA outlines from the live `admin_units` table** (sent to Earth Engine as plain geometry). That keeps the outlines the same as what the map shows, with no asset to maintain.
- [ ] **Test it on a known month:** fetch, say, August 2025 with the job and compare with the stored values. Decide what difference is acceptable (rounding is 3 decimals). If it differs more than that, either change the job to match the method, or re-fetch the whole history with the job so it's consistent from the start.

## 3. Build the job

All code, none of it exists yet.

- [ ] **A "fetcher" interface** (like the repositories: an interface, a real Earth Engine version, and a fake for tests) that returns one value per LGA code per period. Tests must never call Google.
- [ ] **A rainfall-from-rows path in `ImportService`.** `startRainfall` takes an uploaded file; the job has rows already. Split the shared core (match areas, compare with live, create the checked run) so both use it.
- [ ] **An ingest service** that: finds the newest month already live; asks for the months after it up to the last **complete** month; stages them as a run; and applies the promote policy below.
- [ ] **A script,** `npm run rainfall:fetch`, in the style of `layers:load`, with `--dry-run` (do everything, roll back), `--from` and `--to` (a window), and `--backfill` (a long range in chunks).
- [ ] **Only complete months.** The job never writes the current month, so it never creates the empty "incomplete" rows the manual export produces.
- [ ] **Settings** in `env.ts` (optional, so the API still starts without them): the Earth Engine key location, and the id of the CHIRPS data source.
- [ ] **Tests:** a clean month is promoted; a rerun changes nothing; a failed fetch stores nothing; a revised value is left for review; the dry run keeps nothing.

### A system user

Every import run records who created and promoted it, and those columns are required and point at real users (`import_runs.created_by`, `promoted_by`). The job has no signed-in person.

- [ ] **Create a service user** (no Firebase login, administrator role) named something like "Rainfall job", so the import history shows who loaded the data. Scripts are exempt from region checks, as `layers:load` documents (AI rule 9).

### Promote policy

Today a person presses Promote. For a scheduled job, a suggested rule that keeps "nothing goes live by accident":

- **Promote automatically** only when the run has **no failed rows** and **no revised values** (only new months).
- **Otherwise leave it "checked"** for an administrator, and raise the alarm (section 5).

- [ ] **Confirm the policy.** In particular: should small revisions be accepted automatically? CHIRPS's quick "preliminary" values are later replaced by final ones, so revisions are expected for recent months.

## 4. Run it on a schedule

Where it runs matters, because the API is on Render's **free plan, which goes to sleep** ([deployment-render.md](deployment-render.md)).

| Option | Verdict |
|---|---|
| **A Render Cron Job** (a second service in `render.yaml`, running `npm run rainfall:fetch` on a schedule) | **Recommended.** Separate from the API, so the API's sleeping doesn't matter. It is a paid service type on Render; check current pricing |
| **A scheduled GitHub Actions workflow** running the same script | A free alternative. Needs the database URL, the database certificate and the Earth Engine key as GitHub secrets, and Aiven's allowed-IP setting must let it in |
| **A timer inside the API** (`node-cron`) | **Not recommended.** A sleeping service misses runs, and two copies of the API would both run it |

- [ ] **Choose where it runs.**
- [ ] **Add it to `render.yaml`** (or the workflow), with the secrets entered in the dashboard, never in git.
- [ ] **Pick the schedule.** For monthly data: shortly after the Climate Hazards Center publishes the previous month's values (check when; it's typically within the first weeks of the next month). Running more often than needed is harmless, since reruns change nothing.
- [ ] **Set up the Earth Engine side** (if A): create the service account, register it with Earth Engine, and store its key as a secret file on the host (as the database certificate is).

## 5. Notice when it stops working

A job that fails quietly is worse than a manual process, because the cards keep showing old data as if it were current.

- [ ] **Log every run** (what window, how many rows, promoted or left for review), at error level when it fails.
- [ ] **Make failure visible.** Render and GitHub can both flag a failed job. The "import completed / failed" emails mentioned in [data-import.md](data-import.md) aren't built either, so at minimum use the host's failure alerts.
- [ ] **Show "last updated" in the app:** the newest month on record and when it was loaded (the Rainfall card already shows the newest month; add the load date, and a warning when it's more than about a month and a half behind).
- [ ] **Say who gets told** and what they do. A failed job on its own isn't enough if nobody owns it.

## 6. Daily rainfall (the step that makes flood analysis possible)

Monthly totals can't show the one-day downpour behind a flood ([rainfall.md](rainfall.md)). Daily values need the same job and more.

- [ ] **A daily table.** The current table is one row per LGA per month (`year_month`). Daily needs its own (area, date, mm), unique per area and date. About 91,000 rows for 2016 to now, plus 23 a day. Decide whether monthly totals then come from the daily table or stay loaded separately.
- [ ] **Generalise the comparison** (new, filled, revised, unchanged) from "month" to "period".
- [ ] **A read endpoint and card changes** for daily values (a month's days; the wettest days).
- [ ] **Backfill 2016 to now** in chunks, since it is too big for one file (the import limit is 100,000 rows or 60 MB).
- [ ] **Expect revisions:** quick (preliminary) daily values are replaced by final ones, so the last days or weeks will change.

## 7. Other data to get (mostly not code)

- [ ] **A longer baseline, 1981 to 2015.** The same job can fetch it with `--backfill`: one command once the job exists. It moves "average" from about 10 years towards the 30 the WMO recommends.
- [ ] **Ground gauge data from NiMet** (the Nigerian Meteorological Agency). Ask for: the station list with coordinates; daily (ideally hourly) rainfall from 2016 to now; the file format; the licence and any fee; and how often it can be updated. Use a few stations (Port Harcourt, Bonny) to check the satellite numbers, not to replace them. I haven't verified what they will share or at what cost.
- [ ] **Other sources of gauges:** universities, oil companies and NGOs with gauges in the state, and the state ministries.
- [ ] **River levels,** from the Nigeria Hydrological Services Agency (NIHSA) or whoever holds the river gauges. For the riverine and delta LGAs, floods follow river and tide levels as much as local rain.
- [ ] **Hourly near-real-time rainfall** (NASA GPM IMERG in Earth Engine), for "what just happened" and for storm intensity.
- [ ] **Soil wetness** (ERA5-Land): the same rain floods more when the ground is already full.

## 8. Things that go with it

- [ ] **Flood and disaster events with dates (Phase 4).** The reason for all of the above: without them no one can say what rainfall precedes a flood.
- [ ] **A flood threshold per LGA,** found by comparing daily rain on flood days with other days, once events and daily rain both exist.
- [ ] **Alerts,** only after that threshold exists, and only from daily or forecast rainfall.

## Risks to keep in mind

- **Production and local development share one database** ([deployment-render.md](deployment-render.md) flags this). A job run on a laptop without `--dry-run` writes to production data. Always dry-run locally, or use a scratch database.
- **A key in git is a leak.** The Earth Engine key belongs in the host's secrets only. Add its file name to `.gitignore` before creating it.
- **Quiet staleness** (section 5) is the likeliest way this goes wrong.
- **Cost and terms:** Earth Engine terms, the Render cron service and any gauge-data fees should be agreed with whoever pays and owns the infrastructure (standard section 1 puts infrastructure under the Cloud Engineer).

## Suggested order

1. Decide the method, the hosting and an owner (sections 1 and 4).
2. Check the method against a known month (section 2). This can happen before any scheduling.
3. Build the fetcher, the ingest service and the script, and dry-run them (section 3).
4. Create the service user and the data source, then schedule it (sections 3 and 4).
5. Add the failure alerts and the "last updated" display (section 5).
6. Backfill 1981 to 2015 (section 7).
7. Start the gauge-data requests early, since they take the longest and don't depend on code (section 7).
8. Daily rainfall (section 6), then events and thresholds (section 8).

## Resources to read

- Earth Engine: service accounts and server-side use: https://developers.google.com/earth-engine/guides/service_account
- Earth Engine: `reduceRegions`: https://developers.google.com/earth-engine/guides/reducers_reduce_regions
- CHIRPS data and publishing schedule (Climate Hazards Center): https://www.chc.ucsb.edu/data/chirps
- Render cron jobs: https://render.com/docs/cronjobs
- GitHub Actions scheduled workflows: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule

I haven't opened these pages from this machine, so if a link has moved, search the provider's docs for the page title.

## Explain it like I'm new to this

Today, getting new rainfall is like going to the post office each month to collect a parcel by hand. Automating it means hiring a courier who knocks every month: asks the satellite service for last month's numbers for each LGA, checks them the same way you would, and puts them on the shelf if they look right. If something looks odd, the courier leaves them on the table for you instead of shelving them, and tells you. The work is mostly in three things: making sure the courier measures the same way the old parcels were measured, giving the courier a name badge (the service user) and a key (the credentials), and making sure someone notices if the courier stops coming.
