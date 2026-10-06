# Account Emails (Firebase Templates)

## What was built

Consistent wording and naming for the two account emails Firebase sends for us: **verify your email** (after sign-up, or when the user clicks *Resend link*) and **reset your password**. Before this change they arrived as "Verify your email for project-476926185835", signed "Your project-476926185835 team". That is a raw Firebase project ID, and it made a genuine email look like phishing. Now both emails use the name users see in the app, **GeoClime Intelligence**, with the same subject style, sender name and sign-off.

Two client changes go with it:
- Both emails are always sent in English, to match the templates.
- After using a link, the user gets a **Continue** button back into the app. If they verified their email, the "Verify your email" notice disappears when they return, without signing out and back in.

## How it works

**Who sends these emails.** Firebase Authentication sends both of them, not our backend (standard section 15 keeps verify-email and reset-password on Firebase). The client only asks for them:
- Sign-up: [`SignUpPage.tsx`](../../client/src/pages/auth/SignUpPage.tsx) → `signUp` in [`transport/firebase-identity.ts`](../../client/src/transport/firebase-identity.ts) → Firebase's `sendEmailVerification`.
- *Resend link* in the verify-email banner shown on every signed-in screen: [`VerifyEmailBanner.tsx`](../../client/src/components/layout/VerifyEmailBanner.tsx) → `sendEmailVerification` from `useAuth()`.
- Forgot password: [`ForgotPasswordPage.tsx`](../../client/src/pages/auth/ForgotPasswordPage.tsx) → `sendPasswordReset` → Firebase's `sendPasswordResetEmail`.

The text of the emails therefore lives in the **Firebase console**, not in our code. Firebase lets you edit a template's sender name, sender address, reply-to address and subject. It lets you edit the **message itself only for the password-reset email**. The verification email's body is fixed by Firebase. That body ends with "Your %APP_NAME% team", where `%APP_NAME%` is the project's *Public-facing name*, so setting that name is what fixes it.

**The settings to apply** (Firebase console, project `geoclimate-eab50`):

1. **Project settings → General → Public-facing name:** `GeoClime Intelligence`
2. **Authentication → Templates → Email address verification** (pencil icon):

   | Field | Value |
   |---|---|
   | Sender name | `GeoClime Intelligence` |
   | From | leave as `noreply@geoclimate-eab50.firebaseapp.com` for now (see *Flagged* below) |
   | Reply to | leave as `noreply` until there is a monitored support inbox |
   | Subject | `[GeoClime Intelligence] Verify your email` |
   | Message | not editable |

3. **Authentication → Templates → Password reset** (pencil icon):

   | Field | Value |
   |---|---|
   | Sender name | `GeoClime Intelligence` |
   | From / Reply to | same as above |
   | Subject | `[GeoClime Intelligence] Reset your password` |
   | Message | paste the whole of [`firebase/email-templates/reset-password.html`](../../firebase/email-templates/reset-password.html) |

**The reset-password message** is kept in the repo so changes to it are reviewed like code. It deliberately follows the same shape as Firebase's fixed verification body ("Hello," → one sentence → the link → "you can ignore this email" → "Your GeoClime Intelligence team"), so the two emails read as a pair. It adds two lines aimed at the confusion we saw:
- "use the link in the most recent one", because pressing *Resend link* sends a second email with a different link, and Gmail stacks them in one thread;
- "Your password won't change", so someone who didn't ask for the reset isn't alarmed.

Firebase fills in `%EMAIL%` (the recipient's address) and `%LINK%` (the one-time action link) when it sends. `%DISPLAY_NAME%` is **not** used, because sign-up doesn't set a display name, so it would render as "Hello ,".

**Naming and the standard.** Section 15 of *Backend Engineering Standards* says subjects start with `[Climate Platform]` and the sender is "Rivers State Climate Platform". It was written before the product was named. The client says **GeoClime Intelligence** everywhere (header, tab title, brand mark), so the emails now use that name and the subject prefix becomes `[GeoClime Intelligence]`. The two-tone rule (Transactional/Alerting) is unchanged, and both of these emails are Transactional. When the backend's `EmailService` relay is built, its default sender name should be `GeoClime Intelligence` too.

**Emails are always English.** [`transport/firebase-identity.ts`](../../client/src/transport/firebase-identity.ts) sets `auth.languageCode = "en"`. It used to call `auth.useDeviceLanguage()`, which asks Firebase to send in the browser's language. For someone with a French or Yoruba browser, that could have meant Firebase's own generic translation instead of our customised English template. The app itself is English-only, so English emails are consistent with it.

**The link leads back into the app.** Clicking the link in either email still opens Firebase's small hosted page, which does the actual work: it marks the email verified, or it asks for the new password. That page now also shows a **Continue** button:
- verify email → the Overview (`/`)
- reset password → the sign-in page (`/sign-in`)

The button's address is the *continue URL*. [`transport/email-actions.ts`](../../client/src/transport/email-actions.ts) builds it from the site the user is on (`window.location.origin`), so local, preview and production each link back to themselves. Firebase only accepts a continue URL on a domain listed under **Authentication → Settings → Authorized domains**. `localhost` is there by default; the Vercel domain has to be added (step 6 of [client-deployment-vercel.md](client-deployment-vercel.md)). If Firebase rejects the URL, for example on a brand-new Vercel preview address, `sendWithContinueUrl` sends the email again without it. The user gets a plain email instead of none at all.

**The "Verify your email" notice clears itself.** Firebase's SDK remembers whether the email was verified and only re-checks at its hourly token refresh. So someone who verified from their inbox came back to a notice still asking them to verify. Now, while the signed-in account is unverified, [`contexts/AuthContext.tsx`](../../client/src/contexts/AuthContext.tsx) calls `identity.refreshSession()` in three cases: when the app loads, when the tab regains focus, and when it becomes visible again. In `firebase-identity.ts` that reloads the account from Firebase. If it is now verified, it forces a fresh ID token. That fires the usual session listener, `AuthContext` updates, and the notice disappears. Once the account is verified, the checks stop.

**Tests.** [`transport/email-actions.test.ts`](../../client/src/transport/email-actions.test.ts) covers the continue URL and the fallback. The Cypress spec [`cypress/e2e/auth/session.cy.ts`](../../client/cypress/e2e/auth/session.cy.ts) checks that the notice disappears when the user returns to the tab after verifying elsewhere. It uses the offline fake in [`transport/e2e-identity.ts`](../../client/src/transport/e2e-identity.ts), whose `refreshSession` does the same job without Firebase.

**Checking it after applying.** Create a test account in the client, or press *Resend link*, and check that the subject, sender and sign-off all say GeoClime Intelligence. Click the link, press **Continue**, and check that you land on the Overview without the notice. Then use *Forgot password*, check that the reset email matches, set a new password, and check that **Continue** takes you to sign-in.

**Flagged for the team (NEEDS VERIFICATION):**
- **Sender domain.** *Customize domain* on a template sends from our own domain instead of `firebaseapp.com`. It needs DNS records on a domain the team controls.
- **Reply-to.** Leave it unset until someone owns a monitored inbox. Don't point it at an address nobody reads.

## Resources to read

- Firebase, customize account management emails (fields, placeholders, action URL, sender domain): https://support.google.com/firebase/answer/7000714
- Firebase Web, sending verification and reset emails: https://firebase.google.com/docs/auth/web/manage-users
- Firebase, passing a continue URL in email actions: https://firebase.google.com/docs/auth/web/passing-state-in-email-actions
- Firebase, custom email action handlers (your own landing page for the link): https://firebase.google.com/docs/auth/custom-email-handler
- Firebase JS reference for `Auth` (`languageCode`) and `User` (`reload`, `getIdToken`): https://firebase.google.com/docs/reference/js/auth
- MDN, the Page Visibility API (`visibilitychange`): https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

## Explain it like I'm new to this

Firebase is like a courier firm that delivers our account letters: "please confirm your address" and "here is your password-reset key". We don't write those letters in our code. We fill in the courier's standard form (the template in the Firebase console), and it prints and posts the letter for us. Until now the form still said "from: project-476926185835", like a parcel labelled with a warehouse number instead of the shop's name, so people weren't sure it was really from us. Setting the public-facing name, sender name and subject is putting our shop's name on the envelope. For the password-reset letter the courier also lets us write the letter itself, so we keep that text in the repo, in the same style as the verification letter the courier won't let us change. We also tell the courier to always write in English, the language of our shop. Each letter now carries a return address (the continue URL), so after the reader has done what it asks, there's a "Continue" button that walks them back to our door. And when they come back, the app looks again at whether they've confirmed their address, instead of trusting an hour-old note.
