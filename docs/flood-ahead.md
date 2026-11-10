# Flood warnings as you travel (`server/src/modules/flood-ahead`)

## 1. What was built
Someone walking or driving gets a warning when they come near a place that is flooded **now**: "Flood 2 km away, to the north-east, in Obio/Akpor (knee-deep)". They choose how far ahead to be warned (1, 2, 3, 5 or 10 km). It is opt-in, off until they press **Warn me about floods nearby** on the map's overview card, and works while the app is open.

- **Server:** `flood-ahead.rules.ts` (tunable limits and the pure warning logic), `flood-ahead.repository.ts` (one PostGIS query), `flood-ahead.service.ts` (validation, rate limit, per-connection memory), `flood-ahead.events.ts` (the socket event). `RealtimeGateway.onClientEvent` (common/realtime) lets a feature listen to an event from browsers.
- **Client:** `contexts/FloodAheadContext.tsx` (watches the position, sends it, collects warnings), `components/floods/FloodAheadControl.tsx` (the switch and distance, on the map card), `FloodAheadBanner.tsx` (the warning, in both layouts), `FloodAheadIndicator.tsx` (a dot in the top bar while on).

## 2. How it works
1. While on, the browser watches the device's position (`watchPosition`) and sends `location:update` `{ lat, lon, radiusM, accuracy }` over the app's one Socket.IO connection: every 5 seconds while moving (over about 1 m/s), every 10 while still. Each send is answered with `{ ok, floodsNearby, nearestM }`, so the screen can say what was checked.
2. The server checks the position against the floods near it **in PostGIS** (section 8: spatial work is never done in JS), measuring to the nearest *edge* of the flood, not its middle. "Flooded now" means what the map shows as flooded: a flood a responder recorded on the ground and has **not marked receded** (magenta, "Flood, as recorded"), however long ago, up to a safety cap of `FLOOD_STALE_DAYS` (30) so an unclosed record doesn't warn for ever; plus community reports published in the last `REPORT_FRESH_HOURS` (24). The public alert map's shorter 3-day window is deliberately not used: it skipped floods the map itself still drew as flooded. So **mark a flood receded when the water goes down**, or it keeps warning people.
3. A flood is warned about when it is within the chosen distance and either new, or in a **smaller distance band** than any it was warned at before (bands: the chosen distance, then 5, 3, 2, 1 km, 500, 250, 100 m, those below it). So coming closer warns again, and moving away or standing still does not. A flood is forgotten once the person is `FORGET_MARGIN_M` (300 m) beyond the chosen distance, so wandering along its edge doesn't repeat the warning.
4. The server sends `flood:ahead` `{ warnings }` to **that connection only**, never to a room. The browser shows the banner, vibrates, and, if the app is in the background and notifications are allowed, shows a system notification.

## 3. Privacy
This is the one feature that sends where someone is to the server, so:
- It is **off until the person turns it on**, and the choice is remembered on their device only.
- The position is used for one query and dropped: not stored, not logged (the error log records the error, never the coordinates), not kept in memory. A connection keeps only which floods it has been warned about, and that dies with the connection.
- Warnings go back to the sender alone, and carry only what the public map already shows (points rounded to about 100 m).
- The Privacy page says so (`pages/public/PrivacyPage.tsx`).
- Abuse limits: updates faster than 3 seconds apart are ignored, a position less sure than `MAX_ACCURACY_M` (1 km) is not used (a laptop's network guess would give false warnings), and the payload is validated and `.strict()`.

## 4. Limits to know about
- **It needs the app open.** A web page can't read the position once the phone's screen locks or the browser is closed. While on, the app keeps the screen awake (Screen Wake Lock) so it keeps updating; that costs battery, and the top-bar dot shows it is on. A truly background warning needs a native app.
- It says "away", not "ahead": the server knows which way the flood lies, not which way the person is facing.
- It can only warn about floods that someone recorded or reported. No report, no warning.

## 5. The shared position, and the map's "Follow me"
The device's GPS is watched in one place, `contexts/LiveLocationContext.tsx`. A feature asks for the position with `useLiveLocation(active)`; the watch runs while at least one feature is following and stops when none is, so flood warnings and Follow me together cost one GPS watch. `useLiveLocation` returns nothing to a feature that is off, so one feature never sees the position another is following.

**Follow me** (`hooks/useFollowMe.ts`, `components/map/FollowCamera.tsx`, the button beside "Where am I?" on the map card) moves the blue "You are here" dot as you walk. It is a client-only feature: **nothing is sent to the server for it**. Two switches keep it from being annoying: `following` (the dot is tracked and drawn) and `centring` (the map pans to it). Dragging, pinching or scrolling the map yourself stops the panning but keeps the dot live; **Re-centre** brings the map back. The pin-to-you line and the distance in the pinned-place card update as you move. The screen is kept awake while it is on (`useScreenAwake`).

Before this, "Where am I?" was the only way to get a position on the map and it was a single reading (`getCurrentPosition`), so the dot never moved.

## 6. Resources to read
- [flood-alerts-and-reports.md](flood-alerts-and-reports.md) and [field-survey.md](field-survey.md): where the floods come from.
