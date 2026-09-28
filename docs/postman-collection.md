# Postman Collection

## What was built

A ready-made set of API requests you can import into **Postman**, a desktop app for sending requests to an API by hand. It lets anyone try every endpoint against a running server without writing code. Every request also includes a saved example of each possible response, so you can see what `200`, `401`, `403` and so on look like before you call anything.

## How it works

The files are in [`server/postman/`](../server/postman/).

**1. Import two things into Postman:**
- [`climate-platform.postman_collection.json`](../server/postman/climate-platform.postman_collection.json): the requests.
- An environment, which holds the addresses and credentials the requests use:
  - [`local.postman_environment.json`](../server/postman/local.postman_environment.json) points at `http://localhost:4000`.
  - [`staging.postman_environment.json`](../server/postman/staging.postman_environment.json) and [`production.postman_environment.json`](../server/postman/production.postman_environment.json) have an empty `baseUrl` until those servers exist.

**2. Fill in the environment:**
- `firebaseApiKey`: Firebase console → Project settings → General → *Web API key*. It isn't secret; it identifies the project to Firebase.
- `email` and `password`: the account to sign in as.
- `accessToken` and `userId` start empty. `accessToken` is filled in automatically; you set `userId` when you want to target a specific user.

Never save real passwords into the committed files. Postman stores your filled-in values locally.

**3. Get a token, which is automatic.** The **Auth** folder has **Firebase: sign up** and **Firebase: sign in**. These call Firebase's own REST API (`identitytoolkit.googleapis.com`), not our backend, exactly as the real client app would. Each has a small **post-response script**:

```js
const json = pm.response.json();
if (json.idToken) pm.environment.set("accessToken", json.idToken);
```

That saves Firebase's ID token into `{{accessToken}}`. The whole collection is set to send `Authorization: Bearer {{accessToken}}`, so every other request is signed in automatically and no request has a token pasted into it. Tokens last one hour; run **sign in** again when you start getting `401`s.

**4. What's in the collection:**

| Folder | Request | Example responses |
|---|---|---|
| (top) | `GET /health` | 200 |
| Auth | Firebase: sign up / sign in | (Firebase's response) |
| Auth | `GET /api/v1/auth/me` | 200, 401 (no token), 401 (bad token), 500 |
| Users | `GET /api/v1/users` | 200, 400, 401, 403, 500 |
| Users | `GET /api/v1/users/:id` | 200, 400, 401, 403, 404, 500 |
| Users | `PATCH /api/v1/users/:id/access` | 200, three kinds of 400, 401, two kinds of 403, 404, 500 |

The example responses weren't written from memory. They were captured by running each request against the real Express app with in-memory fakes in place of the database and Firebase, as standard section 14 requires. The status codes come from walking each route's middleware and every error its service can throw.

**A typical first session:** sign up, then `GET /auth/me` (this creates your user row), then promote yourself with the script in [user-management.md](user-management.md), then try the Users folder.

**Keeping it up to date:** every new endpoint gets a request in its module's folder, with one example per possible status code (standard section 12, step 9). Folders mirror `src/modules/`.

## Resources to read

- Postman Learning Center (importing collections, environments, variables, scripts): https://learning.postman.com/docs/
- Firebase Auth REST API (what the sign-in requests call): https://firebase.google.com/docs/reference/rest/auth
- The `Authorization: Bearer` header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization

## Explain it like I'm new to this

Postman is a remote control for the API, and the collection is a remote with every button already labelled. The environment is the dial that picks which TV you're pointing at: your laptop, staging or production. The "sign in" button is special. When you press it, it fetches an hour-long pass from Firebase and slips it into your pocket (`accessToken`). Every other button automatically shows that pass, so you never copy and paste tokens around. Each button also comes with photos of what the screen looks like for every possible outcome, so you know what "not allowed" or "not found" should look like before you press it.
