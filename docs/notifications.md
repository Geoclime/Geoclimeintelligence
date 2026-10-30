# Notifications: In-App, Email and Push

## What was built

When something happens that someone should know about, they hear about it on up to three channels:

| Channel | How | Needs |
|---|---|---|
| In the app | Saved to their inbox; arrives live over Socket.IO, with a toast and the bell's count | Nothing: always on |
| Email | Queued and sent by the email worker ([email.md](email.md)) | `EMAIL_PROVIDER` set up |
| Push | Firebase Cloud Messaging, shown by the app's service worker even when the app is closed | Server: `FIREBASE_SERVICE_ACCOUNT`. Client: `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_VAPID_KEY` |

**What triggers them:**

| Category | Event | Who |
|---|---|---|
| Flood alerts | An official issues an alert | Everyone whose home LGA it covers, staff whose region overlaps it, unscoped staff. Not the issuer. Watch, warning and severe alerts are all sent; warning and severe push as urgent. |
| Your flood reports | A coordinator publishes or rejects your report | The reporter (a rejection includes the reason) |
| Reports to review | Someone sends a flood report | Responders, officials and admins whose region contains it, or with no region |
| Account and access | Someone asks for a staff role / an admin answers | All administrators / the person who asked (and anyone whose role is changed) |

**Settings.**
- Everyone starts with every channel on for every category.
- On **Notifications** (bell → Settings, or the sidebar), each person switches in-app, email and push on or off per category. Staff also see *Reports to review*.
- Push is turned on per device ("Turn on push"): the browser asks for permission.
- Signing out turns push off for that device.

**Also live:** when an alert is issued or ended, every open Alerts page and alert map refreshes itself.

## How it works

**1. Decoupled by events.** Services announce what happened (`domainEvents.emit("alert.issued", …)`, in `common/events/domain-events.ts`) and carry on. `modules/notifications/notification-events.ts` listens, works out who to tell, and writes the message. Listeners run in the background: a slow email or a failed push never slows or breaks issuing an alert, sending a report or answering a request. Listeners are registered only in `server.ts`, so tests send nothing.

**2. Delivery** (`NotificationService.notify`):
- loads each recipient's settings for the category (no row means all on);
- in-app: one `INSERT … unnest` for everyone, then `notification:new` to each person's private Socket.IO room;
- email: looks up addresses, renders each email, queues them in the outbox;
- push: collects every device token and sends in batches of 500. Tokens FCM reports as dead (app uninstalled, permission withdrawn) are deleted.

Each channel is isolated: one failing is logged and the others still go.

**3. Who receives what** is decided in SQL (`notification.repository.ts`). An alert's LGAs reach:
- people whose `home_admin_unit_id` is one of them;
- staff whose `scope_admin_unit_id` is the LGA, its state or one of its wards;
- staff with no scope.

**4. Socket.IO** (`common/realtime/realtime-gateway.ts`) shares the API's port.
- A connection must present a Firebase ID token, checked exactly like the REST API. The socket then joins only `user:<id>`.
- The client asks for a fresh token on every reconnect (`client/src/transport/realtime.ts`).
- The live connection carries nothing the REST API wouldn't give the same person.
- Checked live: a connection with no token, or a forged one, is refused.

**5. Push in the browser.**
- `transport/push-messaging.ts` gets an FCM token using the app's own service worker. That worker (`public/sw.js`) shows the data-only messages, skips them while the app is focused (the in-app toast covers that), and opens the notification's page when tapped.
- Push works in production builds only (the service worker isn't registered in development).
- On iPhones, the app must be added to the Home Screen first.

**Tables** (migration `1792100000000-AddNotificationsAndHomeArea`):
- `notifications`, `notification_preferences` and `push_tokens`;
- `email_outbox`;
- `users.home_admin_unit_id`.

**API** (`/api/v1/notifications`, each person's own data only):
- `GET /`, `GET /unread-count`, `POST /:id/read`, `POST /read-all`;
- `GET|PUT /preferences`;
- `POST|DELETE /push-tokens`.

**Setting up push.**
1. Firebase console → Project settings → Service accounts → *Generate new private key*. Put the JSON in `FIREBASE_SERVICE_ACCOUNT` (server).
2. Project settings → Cloud Messaging → Web Push certificates → *Generate key pair*. Put it in `VITE_FIREBASE_VAPID_KEY`.
3. Put the *Sender ID* (General tab) in `VITE_FIREBASE_MESSAGING_SENDER_ID` (client).

**Tests:**
- `server/tests/unit/notifications.test.ts`: defaults, per-person channels, dead tokens, channel isolation, role categories, profile rules.
- `client/cypress/e2e/account/welcome.cy.ts`: the bell, mark all read, a settings switch.

The SQL was checked against the real database with a script that cleaned up after itself.

## Resources to read

- Socket.IO, "Middlewares" (authenticating a connection): https://socket.io/docs/v4/middlewares/
- Firebase, "Send messages to multiple devices": https://firebase.google.com/docs/cloud-messaging/send-message#send-messages-to-multiple-devices
- web.dev, "Push notifications overview": https://web.dev/articles/push-notifications-overview

## Explain it like I'm new to this

When an official issues a flood warning, the platform doesn't stop to make phone calls. It shouts "a warning was issued!" into the room and goes back to work. A dispatcher hears it, checks who lives in the affected LGAs and how each of them asked to be told, and then: pops a note on the screen of anyone who has the app open, drops an email in the post tray, and sends a buzz to the phones that asked for buzzes. If one of those fails, the others still happen.
