# Finish Setting Up (Onboarding)

## What was built

After signing in for the first time, a person sees **Finish setting up your account** before anything else in the app.

1. **Step 1, details.** All required:
   - **full name** (filled in from sign-up);
   - **phone number**;
   - **home state and LGA**: with one state on the platform it is chosen already.

   Organisation and job title are optional.
2. **Step 2, notifications.** In-app and email notifications are already on. Where the device supports it, *Turn on push* asks the browser for permission. *Go to GeoClime Intelligence* then opens the page they were heading for.

Whatever page an unfinished profile asks for, it lands here first. A finished profile visiting `/welcome` goes straight on. *Sign out* is offered in case it's the wrong account.

The same three details are on **Profile** and can be changed there, but never cleared. The home LGA decides which flood alerts reach the person ([notifications.md](../notifications.md)).

## How it works

- **Server.**
  - A complete profile is `isProfileComplete(user)`: a name of 2+ characters, a phone number and a `home_admin_unit_id`.
  - It is returned as `profileComplete` on `GET /api/v1/auth/me` and carried on `req.user`.
  - `PATCH /api/v1/auth/me` accepts `homeAdminUnitId` (it must be an LGA) and refuses to clear any of the three.
  - `requireCompleteProfile` (`middleware/profile.middleware.ts`) refuses, with 403, the actions that need to know who is acting: sending a flood report, asking for a role, issuing an alert. The web app never meets this; it stops a direct API caller.
- **Client.**
  - `RequireCompleteProfile` sits inside `RequireAuth` around the whole signed-in app and redirects to `/welcome` with the original destination.
  - `/welcome` (`pages/onboarding/WelcomePage.tsx`) uses the sign-in screen's frame.
  - `HomeAreaFields` (state, then its LGAs) is shared by the welcome page and Profile.
  - A user record without `profileComplete` (an older API) counts as complete.
  - The role asked for at sign-up is sent once the profile is finished, when the signed-in app first opens.

## Explain it like I'm new to this

It's like the first day at a new job: before you get your desk, reception asks for your phone number and which office you work from. It only takes a minute, and it means the right people can reach you, and the right warnings reach you, from day one.
