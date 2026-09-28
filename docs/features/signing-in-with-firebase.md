# Signing In with Firebase

## What was built

The sign-in ([`SignInPage.tsx`](../../client/src/pages/auth/SignInPage.tsx)), create-account ([`SignUpPage.tsx`](../../client/src/pages/auth/SignUpPage.tsx)) and reset-password ([`ForgotPasswordPage.tsx`](../../client/src/pages/auth/ForgotPasswordPage.tsx)) screens; [`AuthContext`](../../client/src/contexts/AuthContext.tsx), which knows who is signed in and what they may do; the `useAuth()` hook every other part of the app reads it through; and three route guards: `RequireAuth`, `GuestOnly` and `RequireRole`.

## How it works

All paths are relative to `client/src/`.

1. **The form.** On [`pages/auth/SignInPage.tsx`](../../client/src/pages/auth/SignInPage.tsx) the user types an email and password. react-hook-form checks them against the Zod schema in [`pages/auth/auth.schema.ts`](../../client/src/pages/auth/auth.schema.ts) (a valid email, a non-empty password) and shows problems under each field. This check only gives quick feedback. Firebase decides whether the credentials are right.
2. **Straight to Firebase, not our backend.** The page calls `signIn` from `useAuth()`. That goes through [`transport/identity.ts`](../../client/src/transport/identity.ts) to [`transport/firebase-identity.ts`](../../client/src/transport/firebase-identity.ts), the **only** file that talks to the Firebase Auth SDK, which calls `signInWithEmailAndPassword`. Our backend never sees the password. If Firebase says no, [`transport/identity-error.ts`](../../client/src/transport/identity-error.ts) turns its error code into a plain message. "Wrong email" and "wrong password" deliberately get the *same* message, so the form can't be used to find out who has an account.
3. **Firebase keeps the session.** The SDK stores the session in the browser (IndexedDB) and refreshes the one-hour ID token by itself. Our code never stores, reads or decodes the token (rule 19.3).
4. **AuthContext asks the backend who this person is.** [`contexts/AuthContext.tsx`](../../client/src/contexts/AuthContext.tsx) listens for session changes (Firebase's `onIdTokenChanged`: sign-in, sign-out, and each hourly refresh). On each change it calls `fetchCurrentUser()` in [`endpoints/auth.endpoints.ts`](../../client/src/endpoints/auth.endpoints.ts), which is `GET /api/v1/auth/me`. The role and region scope live in the backend's Postgres `users` table, not in the token, so this is the only way to learn them. For a brand-new account, this first call is also what makes the backend create its `users` row, as General Public.
5. **The token rides along automatically.** [`transport/http.ts`](../../client/src/transport/http.ts) asks the SDK for the current token before *every* request and sends it as `Authorization: Bearer <token>`. If the backend answers `401`, it forces one token refresh and retries once. If that fails too, the Firebase session itself is bad, and `AuthContext` signs the user out.
6. **The state the app sees.** `AuthContext` exposes a `status`:

   | status | Meaning | What the guards show |
   |---|---|---|
   | `loading` | Restoring the session or waiting for `/auth/me` | A "Checking your session…" spinner |
   | `signed-out` | No Firebase session | The sign-in pages |
   | `signed-in` | Firebase session **and** backend user record both known | The app |
   | `error` | Signed in with Firebase, but the backend couldn't be reached | "We couldn't load your account" with **Try again** and **Sign out**. It never guesses a role |

   If a background refresh fails while someone is already signed in (say the Wi-Fi drops for a moment), they stay signed in as they were rather than being thrown out.
7. **Guards.** [`components/routing/RequireAuth.tsx`](../../client/src/components/routing/RequireAuth.tsx) wraps every signed-in screen and sends signed-out visitors to `/sign-in`, remembering where they were going. [`GuestOnly.tsx`](../../client/src/components/routing/GuestOnly.tsx) wraps the sign-in pages and, once sign-in finishes, sends the user on to that remembered page. It only accepts paths inside this app, so a crafted link can't bounce someone to another site. [`RequireRole.tsx`](../../client/src/components/routing/RequireRole.tsx) hides screens a role can't use, with Administrators always allowed, just like the backend's `authorise()`. **These guards only decide what to show.** The backend checks the token and role on every request regardless.
8. **Sign-up and password reset.** Sign-up calls Firebase's `createUserWithEmailAndPassword` and then sends a verification email. The Overview shows a "Verify your email" notice with a resend button until the address is verified. Password reset calls `sendPasswordResetEmail` and always shows the same "If an account exists…" message, whether or not the email is registered. Both emails go out in English with a **Continue** link back into the app, and the notice clears itself when the user returns after verifying. Their wording is set in the Firebase console. See [auth-email-templates.md](auth-email-templates.md).
9. **Sign-out** is in the account menu (top right). It calls Firebase's `signOut`, `AuthContext` sees the session end, and `RequireAuth` returns the user to `/sign-in`.

**Setting it up locally.** In the Firebase console, enable the **Email/Password** sign-in provider (the backend needs it too). Put the web app's config into `client/.env` (see [client-architecture.md](client-architecture.md)). With the API running on port 4000, run `npm run dev` and create an account. To make yourself an Administrator, follow "Your first administrator" in [`server/README.md`](../../server/README.md), then reload the page.

## Resources to read

- Firebase Auth for Web, get started: https://firebase.google.com/docs/auth/web/start
- Firebase password authentication: https://firebase.google.com/docs/auth/web/password-auth
- Firebase manage users and ID tokens: https://firebase.google.com/docs/auth/web/manage-users
- Firebase auth state persistence (why nothing is stored by hand): https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firebase Auth JS reference, including the error codes: https://firebase.google.com/docs/reference/js/auth
- React, passing data deeply with context: https://react.dev/learn/passing-data-deeply-with-context
- Axios interceptors: https://axios-http.com/docs/interceptors
- react-hook-form, getting started: https://react-hook-form.com/get-started
- Zod resolver for react-hook-form: https://github.com/react-hook-form/resolvers

## Explain it like I'm new to this

Think of Firebase as a separate ID-checking office next door to our building (the backend). When you sign in, you don't show your ID at our front desk. You walk next door first. That office checks who you are and hands you a stamped pass that's only good for an hour (the ID token), and it quietly swaps it for a fresh one before it runs out. Every time you ask our building for something (an API request), the transport layer holds that pass up at the door for you. Our front desk checks the stamp is real, then looks you up in our own visitor log to see which rooms you're allowed into: your role and your region. `AuthContext` is the badge clipped to your shirt that says both things, "this is Ada" and "Ada may enter the Users room", so every screen in the app can glance at it instead of asking again.
