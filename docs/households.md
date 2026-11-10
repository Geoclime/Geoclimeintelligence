# Households: Marking Your Home on the Map

## What was built

Anyone signed in can mark their home on the map: click the spot, then **Mark my household here**. Give it a name ("Home", "Mum's house"), and optionally what kind of home it is (house, compound with several houses, apartment or flat, or something else), how many people live there, a phone number responders can call, anything a responder should know, and up to three photos. Someone can mark as many households as they need.

- **Private.** A household is seen by its owner and by staff whose role holds **See households** (`households.view`: responders and officials as seeded, and administrators), for planning and rescue. Nobody else sees it, and it is never on the public alert map.
  - The owner sees theirs as a teal house, labelled from street level. Staff also see everyone else's as slate houses, with who added them.
  - The layer is **My households**, or **Households** for staff, under *Places and services*.
- **Alerts.** The owner is told when a flood alert covers the household's LGA, as people whose home area is there already are. They are also told when a responder records a flood within 500 m of it; that message is marked urgent if the water reaches the house.
- **Flood impact.** A recorded flood's popup counts the registered households inside it ("Reaches 120 buildings, 4 registered households…"). It is a count only, never who or where.
- **Phone and photos are as private as the household.** Its owner and staff with `households.view` see them, and nobody else. Only the owner adds photos (an administrator may remove one, to deal with abuse). A photo is shrunk in the browser before it is sent, and avoiding faces and number plates is asked on the form. Photos never go on a public map. The number is shown in the household's popup as a tap-to-call link.
- **Changing and removing.** Only the owner can change or remove a household, and administrators can remove one to deal with abuse. The spot can't be moved: remove it and mark it again. The activity log records that a household was added or removed, but never where.

## How it works

- **Table** `households` ([`1793300000000-CreateHouseholds.ts`](../server/src/migrations/1793300000000-CreateHouseholds.ts)). Its columns are `owner_id` (deleting the account deletes its households), `label`, `note`, `people` (1 to 200), `home_type` (house, compound, apartment or other), `phone` (international format), `geom` (a point), and the LGA and ward found when it was saved. The last three columns, and the photos table, come from [`1793710000000-AddPhonesHomeTypeAndHouseholdPhotos.ts`](../server/src/migrations/1793710000000-AddPhonesHomeTypeAndHouseholdPhotos.ts). The migration also seeds `households.view` to responders and officials.
- **API**, all signed-in, at `/api/v1/households` ([`household.routes.ts`](../server/src/modules/households/household.routes.ts)):
  - `GET /mine`.
  - `GET /geojson?bbox=` returns the viewer's own households, or everyone's (with owner names) for staff.
  - `POST /` takes `label`, `longitude`, `latitude`, and optionally `note`, `people`, `homeType` and `phone` (`+` and the full number; a blank `phone` on `PATCH` clears it).
  - `GET /:id/photos`, `GET /:id/photos/:photoId/file`, `POST /:id/photos` (multipart `file`) and `DELETE /:id/photos/:photoId` ([`household-photo.routes.ts`](../server/src/modules/households/household-photo.routes.ts)). Up to 3 photos per home. A file is kept like a map photo's: an authenticated Cloudinary asset reached through a signed link, or, with no Cloudinary account, in the database at no more than 2 MB. Anyone who may not see the household gets a `404`. The activity log records that a photo was added or removed, never where the home is.
  - `PATCH /:id` and `DELETE /:id` are for the owner (or an administrator, for deleting). Someone else's household gets a `404`, so nobody can probe for it.
- **Alerts:** `findAlertRecipients` in [`notification.repository.ts`](../server/src/modules/notifications/notification.repository.ts) includes household owners in an alert's LGAs. The `flood.recorded` listener in [`notification-events.ts`](../server/src/modules/notifications/notification-events.ts) tells owners within 500 m, measured on the spheroid, once each.
- **Client:** [`HouseholdLayer.tsx`](../client/src/components/map/HouseholdLayer.tsx), [`HouseholdPopup.tsx`](../client/src/components/map/HouseholdPopup.tsx), [`HouseholdFormDialog.tsx`](../client/src/components/map/HouseholdFormDialog.tsx), [`useHouseholds.ts`](../client/src/hooks/useHouseholds.ts), and for photos [`HouseholdPhotos.tsx`](../client/src/components/map/HouseholdPhotos.tsx) and [`useHouseholdPhotos.ts`](../client/src/hooks/useHouseholdPhotos.ts). The household's photos are sent after the household itself is saved, so a weak signal never costs the household.

## Known limits

- Not run against a database yet: apply the migration on a staging copy first.
- Tests weren't written or updated, by request.
- There is no list of "my households" on the profile page yet. They are managed on the map.
- Deleting an account deletes its households and their photo rows, but the photo files kept in Cloudinary are only removed when the household itself is removed, so they can be left behind.
- The new fields and photos are not run against a database yet: apply migration `1793710000000` on a staging copy first.

## Explain it like I'm new to this

It's like giving the local emergency office your address on a card. Only you and the office staff can read the card. When the office issues a warning for your area, or sees water rising near your street, they know to tell you. When they count who a flood reached, they count your card, but your name and house stay private.
