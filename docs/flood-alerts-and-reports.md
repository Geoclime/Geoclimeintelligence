# Flood Alerts, Community Reports and the National Alert Map

## What was built

**Flood alerts.** Government officials and administrators issue alerts at three levels:

| Level | Means | Suggested actions (editable) |
|---|---|---|
| Flood watch | Flooding is possible. Be prepared. | Follow official updates; avoid rivers and drainage channels |
| Flood warning | Flooding is expected. Act now. | Move valuables up; don't cross flood water; prepare to evacuate |
| Severe flood warning | Danger to life. Act immediately. | Evacuate now; go to higher ground; call 112 |

An alert covers LGAs and/or whole states (never a single ward). A whole state covers every LGA in it, so the form says so: chosen areas show a line such as "Covers 2 LGAs." or "Covers all 23 LGAs in Rivers State.", ticking a state shows a warning that everyone living there is notified, and the state's own LGAs are shown as covered instead of as separate choices. (Ticking "Rivers State" as well as two of its LGAs once colourised all 23 LGAs on the national map, with no hint why.) An alert can be edited while it is in force or scheduled, and deleted in any state. It has a title, a message, actions and a duration: a quick choice from 6 hours to 7 days, or *Custom number of days…* for any whole number of days up to 365 (the form shows the exact end time; a mistyped 3650 is refused). An issuer can end it early. Officials limited to a region can only issue, edit, end and delete alerts inside it.

**Editing and deleting an alert.** On the Alerts page, an alert in force has **Edit**, **End alert** and **Delete**; an ended or expired one has only **Delete**.
- *Edit* opens the issue form filled in with what was issued. The end time stays as it is unless a new one is chosen (*Keep the end time as it is*, or a length counted from now). Changing the level does not overwrite the actions that were written.
- *Notify people about this change* sends the updated alert to everyone it covers, in the app, by email and by push, as "Updated, flood warning: …". It is off by default, so a corrected typo doesn't buzz every phone in the state. Every open Alerts page and map refreshes either way.
- An ended or expired alert is a record of what happened, so it can't be edited (the server answers 409). *Delete* removes an alert in any state for good, with its areas, from the map and every list. People already notified keep their message. If the danger has passed, *End alert* keeps a record.
- Both need access to every area the alert covers, and to any area added.

**Community flood reports.** Any signed-in user can send one:
- the GPS position (asked for when the form opens; tap the map to move the pin);
- a place name, filled in from the LGA and ward and editable;
- the water depth: ankle, knee, waist, chest or impassable;
- a description;
- up to 3 photos and an optional voice note of up to 60 seconds.

Every report starts *Waiting for review*. Emergency responders, government officials and administrators review the reports in their region, then publish or reject them (rejecting needs a reason, which the reporter sees). Reporters follow their reports' status on the same page. A cap of 10 reports per person per hour guards against spam.

**Editing and deleting a report.** Under *Your reports*, a report that is not published has **Edit** and **Delete**; a published one has neither, since it is already public.
- *Edit* changes the place name, the position (the pin on the map), the water depth and the description, and the LGA and ward are found again if the pin moved. Photos, recordings and other files stay as sent (delete the report and send a new one to change them).
- Editing a **rejected** report sends it back to *Waiting for review*, with the old review cleared, and the coordinators hear about it again. The form shows the reason it was rejected.
- A report published while its sender had the form open can't be saved over (409).
- *Delete* removes the report and its files from storage for good. Coordinators (responders, officials and administrators) can delete any report in their region, in any state, from the review queue: for spam, a duplicate, or one published by mistake. The person who sent it is told. Someone else's private report looks like it doesn't exist to anyone else.

**Checking the location before publishing.** Each report card has a *View on map* button. It opens a map under the report, without leaving the queue, with the exact spot pinned at street level.
- The map draws what the platform's own map draws: boundaries (the report's LGA is outlined, so you can see the pin is inside it), waterways, roads, buildings, facilities and settlements. Each has a switch under the map, which also works as the legend. Both maps load their layers through the same code (`hooks/useMapLayers.ts`), so they can't drift apart.
- *Map* and *Satellite* switch between the street map and aerial imagery, which shows the ground itself. Satellite puts the building shapes away, since the photograph already shows them; the switch brings them back.
- *Open on the full map* shows the same spot on the platform's own map, with wards, waterways and buildings, in a new tab.
- *Google Maps* opens the spot there, also in a new tab.
- The map is only downloaded when it is opened, so the queue stays quick on a slow connection. If it can't load, the rest of the card still works.
- Reviewers see the exact position. The public alert map still shows it rounded to about 100 m, and never names the reporter.

**The national alert map.** It colours each LGA by its most severe alert in force, with published reports from the last 7 days as dots.
- **Landing page:** a live status strip under the header (the count of alerts in force in the colour of the most severe one; amber, "No official flood alerts in force. 2 community flood reports in the last 7 days, the deepest chest-deep", when there is no alert but community reports have been published; and "No flood alerts in force right now" in green only when there is neither: calling it all-clear next to a report of deep water would be wrong), and a *National alert map* section with the alerts and a *Report flooding* button.
- **Signed-in app:** `/alerts` has the same map, past alerts, and *Issue an alert* for officials.
- **Navigation:** a new *Flooding* group with Alerts, Report flooding and Review reports.

| Endpoint | Who |
|---|---|
| `GET /api/v1/public/alert-map` | Anyone (no sign-in): alerts in force and published reports, rounded |
| `GET /api/v1/alerts?view=active\|recent` | Signed in |
| `POST /api/v1/alerts`, `PATCH /api/v1/alerts/:id`, `POST /api/v1/alerts/:id/end`, `DELETE /api/v1/alerts/:id` | Official, administrator (region-checked) |
| `POST /api/v1/flood-reports` (multipart), `GET /api/v1/flood-reports/mine` | Signed in |
| `PATCH /api/v1/flood-reports/:id`, `DELETE /api/v1/flood-reports/:id` | The sender, until the report is published; `DELETE` also responder, official, administrator (region-scoped), in any state |
| `GET /api/v1/flood-reports?status=`, `POST /api/v1/flood-reports/:id/review` | Responder, official, administrator (region-scoped) |
| `GET /api/v1/flood-reports/:id`, `GET /api/v1/flood-reports/:id/media/:mediaId` | Reporter; reviewers in scope; anyone signed in once published |

## How it works

**1. Tables** (migration `1791900000000-CreateFloodAlertsAndReports`):
- `flood_alerts` and `flood_alert_areas`.
- `flood_reports`, with a PostGIS point, the LGA and ward found by point-in-polygon, and a status.
- `flood_report_media`.

CHECK constraints hold every rule the code relies on: the levels, the depths, the statuses, a review date exactly when reviewed, and a 3 MB cap per file. Deleting a reporter's account keeps the report and drops the link to them.

**2. An alert's LGAs.** The repository works out every LGA an alert covers (an LGA itself, or a state's LGAs) in the same query, as `lgaIds`. A map of LGAs can then be coloured without another request. The client's `severityByLga` keeps each LGA's most severe alert in force.

**3. Privacy on the public map.** The public endpoint never includes the reporter, the description or media. Points are rounded to 3 decimals (about 110 m). Reviewers see the reporter's name and organisation; other members of the public never do.

**4. Media, stored in Cloudinary.** A report can carry:

| Kind | Up to | Size each | Types (checked by the file's bytes, not its name) |
|---|---|---|---|
| Photos | 3 | 8 MB | JPEG, PNG, WebP |
| Voice note | 1 (60 s) | 10 MB | WebM, Ogg, MP4, MP3 audio |
| Video | 1 (60 s) | 50 MB | MP4, MOV, WebM |
| Documents | 2 | 10 MB | PDF |

- **Setup:** one setting, `CLOUDINARY_URL`, pasted from the Cloudinary dashboard (Settings → API Keys → "API environment variable"): `cloudinary://<api_key>:<api_secret>@<cloud_name>`. Files go under `geoclime/<NODE_ENV>/flood-reports/<YYYY-MM>`, so one account serves development and production without mixing them.
- **Private by default:** every file is uploaded as an *authenticated* asset, so it can't be fetched by guessing its address. The API hands out a signed link (`media[].url`) only in replies to someone allowed to see the report: its reporter, reviewers in scope, or anyone signed in once it is published. The public alert map never includes media.
- **All or nothing:** files are uploaded before the report is recorded. If any upload fails, or recording the report fails, the files already uploaded are removed again (`FloodReportService.store` / `discard`). A video longer than 60 seconds (by Cloudinary's own measurement) is removed and refused.
- **In the browser:** photos are shrunk first (longest side 1,600 px, JPEG), which also strips their GPS and other metadata. A video's size and length are checked on the device before upload. The form asks `GET /api/v1/flood-reports/options` which kinds to offer.
- **Without Cloudinary** (`CLOUDINARY_URL` empty): photos (2 MB) and voice notes (3 MB) are kept in the database and served through the signed-in API (`useReportMedia` fetches them as blobs). Videos and documents are refused with a clear message, and the form doesn't offer them. Migration `1792000000000-StoreReportMediaInCloudinary` records where each file is (`storage`).

**5. Region scope.**
- *Reviewing:* a scoped reviewer sees reports whose LGA or ward is inside their region (`applyRegionScope`). Acting on one is checked with `assertRegionAccess`. A report outside every mapped area belongs to no region, so only unscoped reviewers see it.
- *Alerts:* every area of a new alert is checked the same way.

**6. Freshness.** A severe alert has to reach the landing page within seconds, so nothing holds it back. The public alert map is sent with `Cache-Control: public, no-cache`: browsers and proxies may keep a copy but must ask before using it, and the ETag turns that check into a cheap `304` when nothing changed. (It was `max-age=60`, so a browser could keep showing "no alerts" for a minute after an alert was issued.) The server also kept its own copy of the alert map for a minute, which is what held an alert back longest; it is now 5 seconds, and dropped at once whenever an alert or a published report changes. Then every connected browser is told over Socket.IO, signed in or not (including visitors on the landing page), and refreshes at once: an issued alert appears in well under a second with no page refresh. The page also re-asks every minute and when the tab comes back into view, as a safety net if the live connection is down. See [notifications.md](notifications.md), "Live updates".

**7. The pin.** The report form's pin is a map layer moved by tapping, as standard section 10 requires (no DOM markers). Without a Mapbox token, the GPS button and the coordinates still work.

**Tests:**
- `server/tests/unit/alerts-and-reports.test.ts`: alert status, region checks, end-once; report filing, ward consistency, file sniffing, the hourly cap, visibility, review.
- `client/src/utils/alert-severity.test.ts`.
- `client/cypress/e2e/geography/flooding.cy.ts` and the landing spec.

**Not built yet:** notifying people of a new alert (SMS, push or email); river gauges and forecasts.

## Resources to read

- WMO, "Multi-hazard early warning systems: a checklist": https://library.wmo.int/idurl/4/55893
- OWASP, "File Upload Cheat Sheet" (why the file's bytes, not its name, decide its type): https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- MDN, "MediaRecorder": https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder

## Explain it like I'm new to this

Think of a town noticeboard and a suggestion box. Officials pin warnings on the noticeboard (the alerts), colour-coded by how serious they are, and everyone, signed in or not, can read them. Anyone with an account can drop a note in the suggestion box: "the road by the market is knee-deep, here's a photo". Before a note goes on the public board, a coordinator reads it to make sure it's real. And when it goes up, it shows the street, not the house, and never the name of the person who wrote it.
