# Verify Your Email Before You Can Sign In

## What was built

A new account is no longer signed in when it is created. Creating an account now sends a verification link and shows a "Check your email" screen. The person has to click the link, then sign in. Signing in with a correct password but an **unverified** email is refused, with a message and a **Resend link** button.

Before this change, Firebase signed the new account in straight away and the app showed it the whole dashboard with a yellow "Verify your email address" banner. That banner, and the code that re-checked the account every time the tab regained focus, are gone: the app can no longer be in a "signed in but unverified" state, so there is nothing for them to do.

## How it works

All paths are relative to `client/src/`.

1. **The rule lives in one file.** [`transport/firebase-identity.ts`](../../client/src/transport/firebase-identity.ts) is the only file that talks to Firebase. Firebase itself signs a user in the moment an account is created or a correct password is entered, verified or not, so this wrapper undoes that for unverified accounts. Everything else in the app just asks the wrapper.
2. **Creating an account** ([`pages/auth/SignUpPage.tsx`](../../client/src/pages/auth/SignUpPage.tsx) → `signUp`):
   - calls `createUserWithEmailAndPassword`;
   - sends the verification email (best effort, see below);
   - **signs out again**.

   The page then swaps the form for a "Verify your email" panel with a **Go to sign in** button. If the email couldn't be sent (say Firebase is rate-limiting), the account still exists, so `signUp` reports `verificationSent: false` and the panel says so honestly and points the person to the sign-in page, where they can ask for another link.
3. **Signing in** ([`pages/auth/SignInPage.tsx`](../../client/src/pages/auth/SignInPage.tsx) → `signIn`): after Firebase accepts the password, `signIn` checks `user.emailVerified`. If it is false, it signs out and rejects with our own error code `app/email-not-verified` (defined in [`transport/identity-error.ts`](../../client/src/transport/identity-error.ts)). The page shows a warning with **Resend link** instead of the red error box. A *wrong* password still gets the usual "doesn't match an account" message. Because the verification message only appears after a *correct* password, it can't be used to find out who has an account.
4. **Resending the link** (`resendVerificationEmail`): signed out people have no Firebase user to send from, so this signs in with the email and password still in the sign-in form, sends a fresh link, and signs out again. If the account turns out to have been verified in the meantime, it sends nothing and simply leaves them signed in, as a normal sign-in would.
5. **The app never sees an unverified account.** `onSessionChanged` in the same file reports an unverified Firebase user as "no session" (`toSession`). That matters even though we sign out: Firebase notifies listeners *before* our sign-out runs, and a stored unverified session from an older visit would otherwise be restored on page load. Without this, [`contexts/AuthContext.tsx`](../../client/src/contexts/AuthContext.tsx) would call `GET /api/v1/auth/me` with an unverified token. So for an unverified account the backend isn't contacted at all, and its `users` row is created at the first sign-in *after* verification.
6. **After clicking the link.** Firebase's hosted page marks the email verified and shows a **Continue** button. That button now goes to `/sign-in` (it used to go to `/`), set by `CONTINUE_PATHS.verifyEmail` in [`transport/email-actions.ts`](../../client/src/transport/email-actions.ts). The person signs in as normal.
7. **Tests.**
   - [`transport/firebase-identity.test.ts`](../../client/src/transport/firebase-identity.test.ts) replaces the Firebase SDK with spies and checks the rule itself: sign-up sends the email *then* signs out; unverified sign-in signs out and is refused; verified sign-in is untouched; unverified accounts are reported as "no session"; resend signs out again even if sending fails.
   - [`cypress/e2e/auth/sign-up.cy.ts`](../../client/cypress/e2e/auth/sign-up.cy.ts) and [`sign-in.cy.ts`](../../client/cypress/e2e/auth/sign-in.cy.ts) check the screens. They use the offline fake in [`transport/e2e-identity.ts`](../../client/src/transport/e2e-identity.ts), which follows the same rules: `signUp` never stores a session, and `unverified@example.com` can't sign in. So Cypress proves the **screens**, and the unit tests prove the **gate**. Neither signs in against a real Firebase project.

**What happens to people who already have an account but never verified?** They are now treated like new sign-ups: next time they sign in they get the "Verify your email" message and can resend the link. A browser that still holds their old session is signed out on the next page load, because step 5 hides unverified sessions.

**Flagged for the team (NEEDS VERIFICATION):**
- **The backend still accepts unverified tokens.** This change is enforced in the web client. Someone who calls Firebase's REST API directly can get a token for an unverified account, and `GET /api/v1/auth/me` will accept it and create a General Public row. To enforce the rule server-side as well, [`auth.middleware.ts`](../../server/src/middleware/auth.middleware.ts) would reject tokens where `req.firebaseUser.emailVerified` is false (the field already exists on the verified identity). That is a one-line server change plus a test; it wasn't made here because it also decides what API clients other than this web app experience.
- **Not run against a real Firebase project.** The unit tests and Cypress use a fake, so the one assumption to check by hand is that `signInWithEmailAndPassword` returns a user whose `emailVerified` is already up to date. To check: create an account, click the emailed link, then sign in. You should land in the app on the first try, and an account whose link you haven't clicked should be refused.
- **Firebase console.** *Email address verification* must stay enabled, and the app's domain must be in *Authentication → Settings → Authorized domains* so the **Continue** button can link to `/sign-in` (otherwise `sendWithContinueUrl` falls back to a plain email with no button, as before).

## Resources to read

- Firebase, send a verification email, and the `emailVerified` property: https://firebase.google.com/docs/auth/web/manage-users
- Firebase, password authentication (`createUserWithEmailAndPassword` signs the user in): https://firebase.google.com/docs/auth/web/password-auth
- Firebase, auth state persistence (why an old session can come back on page load): https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firebase Auth JS reference (`onIdTokenChanged`, `signOut`, `User.emailVerified`): https://firebase.google.com/docs/reference/js/auth
- Firebase, verifying ID tokens on the server (the `email_verified` claim): https://firebase.google.com/docs/auth/admin/verify-id-tokens
- Vitest, mocking modules (`vi.mock`, `vi.hoisted`): https://vitest.dev/guide/mocking

## Explain it like I'm new to this

Think of a members-only gym. Before, the front desk handed you a keycard the moment you filled in the sign-up form, and a sticker on your forehead said "email not confirmed yet". You could walk in and use every machine. Now, when you sign up, the desk posts a confirmation letter to your home address and takes the keycard back. You can only be given a working card after you bring the letter's code. If you come back and say the right name and password but haven't confirmed the address, the desk says: "Your password is right, but I still need you to confirm your address. Want me to send the letter again?" Because the desk only says that once the password is correct, a stranger can't use it to find out who is a member. The one thing still to decide is the back door: the desk has stopped giving out cards, but the machines themselves (the backend) don't yet check the card says "confirmed" on it.
