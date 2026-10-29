# Rainfall

## What was built

Monthly rainfall for each of Rivers State's 23 LGAs, from January 2016, loaded by an administrator and shown on each LGA's page.

- **A `rainfall_observations` table:** one value per LGA per month, each pointing at its LGA and its data source.
- **An import path** for the CHIRPS export from Google Earth Engine (`CHIRPS_rain_csv_Rivers_2016_2026_combined.xlsx`). It uses the same check-then-promote pipeline as boundaries: [data-import.md](data-import.md), section 8.
- **A read endpoint:** `GET /api/v1/rainfall?adminUnitId=…`.
- **A Rainfall card** on the LGA page: the latest month, the last 12 months, any year's months, and every year's total, each against what is usual.

This page explains why the platform needs it, what the unit means, and how to tell a high month from a low one. How it is loaded and checked is in [data-import.md](data-import.md); the client side is in [features/admin-geography.md](features/admin-geography.md).

## Why the platform needs rainfall

The platform is for climate intelligence and disaster management in Rivers State, and the main hazard there is flooding. Rainfall is what drives it. Without rainfall the platform can say where things are (boundaries, roads, rivers, buildings) and, from Phase 4, what happened (disaster events). It can't say anything about the conditions behind them.

- **It explains events.** Rainfall and disaster events both point at the same LGA (see [ERD_Documentation.md](../ERD_Documentation.md)). So an analyst can put "3 flood events in Oyigbo in August" beside "August was 40% wetter than usual in Oyigbo". Rainfall alone says little; beside events it starts to explain them.
- **It defines "normal".** More than nine years per LGA gives a baseline: the usual August, the usual year. That is what turns "304 mm" into "3% drier than an average August". A raw number means little to a responder or an official without it.
- **It compares places.** Bonny, Opobo-Nkoro and Andoni are consistently the wettest LGAs; Obio-Akpor, Etche and Omuma the driest (section below). That feeds flood-susceptibility zones and decides where preparedness effort goes.
- **It is the first step to early warning.** "This month is far above normal in an LGA that flooded the last time that happened" is the reasoning an alert system automates. The history has to exist before that can.
- **It supports planning and reporting.** Government users get seasonal patterns (the wet season, the August dip) and year-to-year trends, with the source shown, for drainage plans, relief stock and funding requests.

**What it can't do:**
- **It isn't real-time warning.** A monthly total hides the one-day downpour that floods a street in Port Harcourt. Live alerts need daily or forecast rainfall.
- **It isn't ground truth.** CHIRPS blends satellite estimates with station gauges, on a grid about 5 km across. Each LGA's value is an average over that grid, so small LGAs (Port Harcourt, Okrika, Ogu-Bolo, Bonny) rest on only a few grid cells.
- **It is most useful beside flood events,** which arrive in Phase 4.

## What "mm" means

**Millimetres (mm) of rain is a depth: how deep the water would be if all of it stayed where it fell.** No draining away, no soaking in, no evaporating.

- 1 mm of rain is **1 litre on every square metre**.
- 100 mm over a 100 m² roof is 10,000 litres.
- 100 mm over 1 km² is 100,000 cubic metres, or 100 million litres.

A monthly figure is a total for the month, so **300 mm in a month is about 10 mm a day on average**. It could equally have fallen in a handful of storms.

The number on the Rainfall card is the **average over the whole LGA**, not what a gauge on one street would read. A storm can put 100 mm on one ward and 5 mm on the next; the LGA figure smooths that out.

## High or low?

There are two different questions, and the card answers the second.

1. **High or low in itself?** What the number is, whatever the month.
2. **High or low for this time of year?** How it compares with the same month in other years.

### 1. In itself

Rivers State has a long wet season and a short dry one, so the same number means different things in different months. These are the average months across all LGAs, 2016 to 2026:

| | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mm | 36 | 51 | 151 | 164 | 249 | 380 | 420 | 304 | 382 | 327 | 204 | 48 |

December to February is the dry season; June to October is the wet one, with a dip in August.

A rough scale, from where a month's value sits among the 2,944 LGA-months in the data:

| A month with… | Is | How often |
|---|---|---|
| under about 110 mm | **low** | the lowest quarter of months |
| 110 to 330 mm | **moderate** | the middle half |
| over 330 mm | **high** | the top quarter |
| over about 430 mm | **very high** | the top tenth |
| over about 640 mm | **exceptional** | the top 1% (the record is 767 mm) |

This scale describes this data only. It is not an official classification.

**Don't read it without the season.** A December of 100 mm is a very wet December (only 1 dry-season month in 10 reaches 99 mm), while a July of 300 mm is a below-average July (the average is 420). That's why the card compares each month with its own month in other years.

**Years:** an average year in Rivers State is about **2,700 mm**. The state-wide yearly totals so far run from **2,266 mm (2022, 16% below)** to **3,182 mm (2019, 17% above)**. By LGA, the wettest are Bonny (about 3,400 mm a year), Opobo-Nkoro (3,390) and Andoni (3,320); the driest are Obio-Akpor (2,310), Etche (2,360) and Omuma (2,390). The averages are the plain mean of the 23 LGAs, not weighted by area.

### 2. For the time of year

This is what the card says: "304 mm, 3% drier than an average August (2016–2025)". The average is the same calendar month in the other years, so a year is never compared with itself.

**Be careful with small percentages.** The card says "wetter" or "drier" for any difference of 5% or more, but monthly rainfall swings a lot. Across the LGA-months in the data, a month differs from its own usual level like this:

| Compared with the same month in other years | Meaning | How often |
|---|---|---|
| within about 25% either way | **ordinary variation** | about half of months |
| 25% to 45% above or below | **noticeably wet or dry** | |
| more than about 45% above or below | **unusual** | about 1 month in 10 on each side |

Only 14% of months are within 5% of their average. So "12% wetter than an average August" is a normal August, not a wet one. Wording like "wetter" is accurate but it should not be read as a warning.

**For a whole year** the swing is smaller, so a difference of more than about 10% from the average year is already notable.

## Is there an mm value that means a flood?

**No. There is no single mm value that leads to a flood, and the monthly figure the platform holds can't be that value.**

Think of a car crash. Knowing a car drove 400 km in a month doesn't tell you whether it crashed; what matters is how fast it was going at one moment. Flooding works the same way. What matters is how much rain falls **in a short time** (an hour, a day), because drains and the ground can only absorb so much at once. A monthly total is the "400 km in a month" figure.

### Why 400 mm doesn't mean flood

- **It's an ordinary wet-season month.** The usual July is 420 mm, and the median June–October month is 350 mm. 400 mm is "high" on the scale above (the top quarter of months), but below "very high", and Rivers State has such a month every year.
- **It averages about 13 mm a day,** which drains usually cope with. The same 400 mm could include one 100 mm day that floods streets. The monthly figure can't tell the two apart.
- **Months, not days.** In January the same 400 mm would be about eleven times the usual, which is a different matter.

### What the monthly number can't show

These are general hydrology, not something derived from this data:

- **How the rain fell.** 500 mm spread over a month of evenings is mostly manageable; 150 mm in a day is not.
- **How wet the ground already was.** The same rain floods more late in the wet season, when the ground and drains are full.
- **Tides, river levels and local drainage.** These matter a great deal in the delta LGAs, and they differ from place to place.

### Rough guide for a single day

Rules of thumb used in many places. **They are not measured for Rivers State and not taken from this data**, and they depend heavily on local drainage:

| Rain in one day | What it usually means |
|---|---|
| under about 25 mm | ordinary; drains cope |
| 25–50 mm | heavy; street flooding possible where drainage is poor |
| 50–100 mm | very heavy; flooding likely in low-lying or built-up areas |
| over about 100 mm | extreme; widespread flooding likely |

Very intense rain over an hour (around 30–50 mm or more) can flood streets even when the day's total looks modest.

### Where a real threshold would come from

For a given LGA the threshold can only be learned locally, by comparing rainfall with records of when it actually flooded: for example, "Port Harcourt floods when a day exceeds roughly X mm", or "Bonny floods mostly at high tide whatever the rain". Nothing in the platform can give that number yet, because it has neither piece it needs:

1. **Flood events with dates.** These arrive with Phase 4 (disaster events).
2. **Daily rainfall.** The loaded data is monthly. CHIRPS also publishes daily values at the same ~5 km resolution, so the same import pipeline could load them.

With both, rain on flood days can be compared with rain on other days to find a threshold per LGA from the platform's own history.

**Until then,** use rainfall as context beside events, not as a trigger. The card says what is normal and how unusual a month is; it does not predict a flood. Treat high rainfall as raised background risk, and "far above the usual for that month" (more than about 45%) as the stronger signal.

## How it works

All paths are relative to the repository root.

- **Table:** [`server/src/migrations/1791600000000-CreateRainfallObservations.ts`](../server/src/migrations/1791600000000-CreateRainfallObservations.ts). One row per LGA and month; `mean_rainfall_mm` is empty for a month the source hasn't finished.
- **Loading and checks:** [data-import.md](data-import.md), section 8, and [`rainfall-rows.ts`](../server/src/modules/data-sources/imports/rainfall-rows.ts).
- **Reading it:** [`server/src/modules/rainfall/`](../server/src/modules/rainfall/). The reply is one area's months, oldest first, with data types and sources.
- **The card:** [`client/src/components/rainfall/`](../client/src/components/rainfall/). The figures (averages, totals, percentages) are worked out in [`rainfall-summary.ts`](../client/src/utils/rainfall-summary.ts), with tests beside it.
- **Rules the card follows:**
  - An average needs at least **two other years** behind it, or the card says "Not enough years".
  - A year only gets a total when it has **all 12 months**. A year in progress (2026) shows "so far" and isn't compared.
  - A month with no value is a dash, never zero.
  - "Close to" means within 5%, as above.

## What still needs doing

A checklist, in the order to do it. Tick items off as they're done. Written 2026-10-29; nothing below has been done unless ticked.

### 1. Before the card shows real numbers

The code is written and tested, but none of this has been run against the real database or seen in a browser.

- [x] **Run the migration** that creates `rainfall_observations`: `npm run migration:run` in `server/`. *(Done. Note it also ran against the shared database that production uses; see the risks in [rainfall-automation.md](rainfall-automation.md).)*
- [x] **Make sure the 23 LGAs are live** (Imports → New import, level LGA). Rainfall attaches to them, so it can't be loaded first. *(Needed for the upload to work.)*
- [x] **Add the data source** for CHIRPS (Imports → Add a source): provider *Climate Hazards Center, UC Santa Barbara*, dataset *CHIRPS v2.0*, licence and the download date. *(Needed for the upload to work.)*
- [x] **Import `CHIRPS_rain_csv_Rivers_2016_2026_combined.xlsx`:** Imports → New import → Rainfall: monthly per LGA. Review it (expect 2,967 rows, none failed, 23 empty September 2026 rows) and Promote. *(Upload tested. Confirm the run was promoted, so the cards have data.)*
- [ ] **Check the result in the browser:** open an LGA page (e.g. Port Harcourt) and look at the Rainfall card. Check the Show picker, the year-by-year chart, the table views, dark mode and a phone-width window.
- [ ] **Run the promote step against a real database once.** Its SQL (the "changed since checked" guard and the upsert) is only covered by unit tests with fakes. Promote the file, then promote it again after editing one value, and check that one month is replaced.
- [ ] **Re-upload the same file** and confirm every month shows "Already live" and Promote has nothing to write.
- [ ] **Fix Cypress** (`npx cypress install`; it currently fails with `bad option: --smoke-test`) and run `client/cypress/e2e/geography/places.cy.ts`, which has new rainfall tests that have never run.
- [ ] **Commit the work.** Nothing from the rainfall changes is committed yet. The two OSM `.zip` files and the CHIRPS `.xlsx` in the repo root are untracked data files: decide whether they belong in git.

### 2. Decisions to make

- [ ] **Is CHIRPS `OBSERVED` or `ESTIMATED`?** It is stored as `OBSERVED`, as the ERD says. CHIRPS blends satellite estimates with gauges, so `ESTIMATED` may be more honest. It's one value in `ImportService.startRainfall`; changing it later means updating the stored rows.
- [ ] **Who owns the data going forward?** CHIRPS grows by a month each month. Decide who exports and uploads each month, or whether it becomes automatic (section 4).

### 3. Small improvements to the card

- [ ] **Say "about normal" within the ordinary range.** The card says "wetter" or "drier" for any gap of 5% or more, but about half of all months are within 25% of their average. Suggested: "about normal" within 25%, "wetter"/"drier" from 25%, "much wetter"/"much drier" beyond about 45%.
- [ ] **Longer baseline.** Ten years is short for "average"; the WMO recommends 30. CHIRPS goes back to 1981: export 1981–2015 and import it the same way.
- [ ] **A rainfall layer on the home map,** colouring LGAs by the latest month or season. The layer toggle only lists layers that have data, so this would add one.

### 4. Getting the data automatically, and better data

**Moved to its own page: [rainfall-automation.md](rainfall-automation.md).** It covers the scheduled job (how to fetch, matching the existing history, the code to build, where to run it, failure alerts), daily rainfall, and the other data to get (a 1981 baseline, NiMet and other gauges, river levels, hourly data, soil wetness). See [Is there an mm value that means a flood?](#is-there-an-mm-value-that-means-a-flood) for why daily data and gauges matter.

### 5. Needs other phases first

- [ ] **Flood and disaster events with dates (Phase 4).** Without them nobody can say what rainfall precedes a flood.
- [ ] **A flood threshold per LGA.** Once events and daily rainfall both exist, compare rain on flood days with other days to find the level at which each LGA floods. Tides matter for the delta LGAs, so some floods won't follow the rain at all.
- [ ] **Show rainfall beside events** on the LGA page and in reports: "3 flood events in Oyigbo in August; August was X% above usual".
- [ ] **Alerts** (the ERD's early-warning idea): only after the threshold above exists, and only with daily or forecast rainfall, not monthly.

## Resources to read

- CHIRPS (Climate Hazards Center, UC Santa Barbara): https://www.chc.ucsb.edu/data/chirps
- Funk et al., 2015, *The climate hazards infrared precipitation with stations*, Scientific Data: https://www.nature.com/articles/sdata201566
- WMO, *Guidelines on the Calculation of Climate Normals* (WMO-No. 1203). It recommends a 30-year baseline; the loaded history is about 10 years, so treat "average" here as "average of recent years". CHIRPS reaches back to 1981, so the baseline could be extended.

## Explain it like I'm new to this

Imagine leaving a straight-sided bucket in an open field for a month. At the end you measure how deep the water is. If it's 300 mm deep, the month's rainfall was 300 mm. Rivers State's bucket would hold about 2.7 metres of water in a normal year.

Whether that is a lot depends on the month, like asking whether 30 degrees is hot: yes in January, no in April. So the page doesn't just show the number. It sets each month against the same month in other years, and the year-by-year chart does the same for whole years. A month a bit above or below its usual is normal; one far above or below is worth a look. And a full bucket tells you how much rain there was, not whether a street flooded: that depends on how quickly it fell and where it could go. A bucket that fills over a month is a normal month; the same amount in one afternoon is a flood. That is why no single mm figure means "flood", and why the platform would need daily rainfall and dated flood records before it could say what the figure is for each LGA.
