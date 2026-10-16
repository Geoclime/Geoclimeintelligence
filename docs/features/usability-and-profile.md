# Usability Pass: Compact Layout, Profile, Search and Help

## What was built

A pass to make the client lighter on screen and easier to use without someone showing you around:

1. **A compact layout.** Smaller type, a narrower sidebar, a shorter top bar, and tighter buttons, fields, tables and cards. Inter is now actually loaded.
2. **A real profile page** at `/account`. It has:
   - a summary card with initials, role, region, join date and how complete the profile is;
   - an editable **Personal details** form (name, phone, organisation, job title);
   - **Sign-in and security**: a password-reset email and sign-out;
   - **Preferences** (theme);
   - **Shortcuts** to the most useful pages.
3. **Name at sign-up.** New accounts are asked for a full name, so profiles don't start empty.
4. **Profile reminder.** A dot on the avatar and a prompt in the account menu while the account has no name.
5. **Quick search** in the top bar. Jump to any page, LGA or ward by name. Opens with `Ctrl`/`⌘` + `K` or `/`.
6. **A Help page** at `/help`. Searchable answers, grouped by topic: getting started, the map, roles, your account and (administrators only) setting up the platform. It also lists the keyboard shortcuts. It's linked from the sidebar, the top bar and the account menu.
7. **A Platform setup checklist** for administrators on the profile page. It ticks off: add a country, import the state, the LGAs and the wards, then give the team access. Every tick comes from live data, and the card disappears when all five are done.
8. **Users page improvements.** Search by name, email or organisation, filter by role (both kept in the URL), see each person's job title and organisation, and see region scopes by name instead of an ID.

The backend side (new columns, `PATCH /api/v1/auth/me`, the `q` and `role` filters) is in [user-profiles.md](../user-profiles.md).

## How it works

All paths are relative to `client/src/`.

**Compact layout.** The type scale in [`styles/globals.css`](../../client/src/styles/globals.css) moved down one step, so everything that uses the tokens shrank together:

| Token | Before | Now |
| --- | --- | --- |
| Body (`--text-md`) | 16px | 14px |
| Secondary (`--text-sm`) | 14px | 13px |
| Page title (`--text-2xl`) | 32px | 22px |

There's also a new `--text-2xs` (11px) for labels. Other sizes:

| | Before | Now |
| --- | --- | --- |
| Top bar | 64px | 56px |
| Sidebar | 248px | 228px |
| Collapsed sidebar | 72px | 64px |
| Sidebar links | 40px | 34px |
| Buttons (sm / md / lg) | 32 / 40 / 48px | 30 / 36 / 42px |
| Text fields | 44px | 40px |

On touch screens, fields stay at 16px so phones don't zoom in when you tap one. [`index.html`](../../client/index.html) loads Inter from Google Fonts. If it can't load, the system font is used.

**Profile data.** `AuthUser` ([`types/auth.types.ts`](../../client/src/types/auth.types.ts)) gained optional `phone`, `organisation`, `jobTitle`, `createdAt` and `updatedAt`. They're optional so an older backend still works. `updateProfile(patch)` in [`contexts/AuthContext.tsx`](../../client/src/contexts/AuthContext.tsx) calls `updateCurrentUser` ([`endpoints/auth.endpoints.ts`](../../client/src/endpoints/auth.endpoints.ts)) and swaps the returned record into context. Because of that, the top bar, menu and page all update straight away. [`utils/profile.ts`](../../client/src/utils/profile.ts) has the shared `initials()`, the completeness checklist, and `needsName()` (which drives the avatar dot).

**Profile form.** [`pages/account/AccountPage.tsx`](../../client/src/pages/account/AccountPage.tsx) uses react-hook-form with [`profile.schema.ts`](../../client/src/pages/account/profile.schema.ts), which mirrors the server's rules.

- Only fields you changed are sent. An emptied field is sent as `null`, which clears it.
- **Save** stays disabled until something changes, and **Discard changes** puts the saved values back.
- Server field errors appear under the right input, through `applySubmitError`.
- **Change password** uses the existing Firebase password-reset email, because the platform never handles passwords itself.

**Name at sign-up.** [`pages/auth/SignUpPage.tsx`](../../client/src/pages/auth/SignUpPage.tsx) has a **Full name** field (at least 2 characters). `identity.signUp(email, password, displayName)` calls Firebase `updateProfile` before signing out again. The name then rides on the ID token into the backend's first `GET /auth/me`. If saving the name fails, the account is still created and the user can add the name later.

**Quick search.** [`components/layout/QuickSearch.tsx`](../../client/src/components/layout/QuickSearch.tsx) sits in the top bar.

- Pages are matched in the browser, from `NAV_GROUPS` filtered by role, plus Profile and Help.
- Places are searched on the server with `GET /api/v1/admin-units?q=` after two or more letters, debounced 250 ms, up to 8 results.
- An LGA opens `/places/:id`. A ward opens `/places/:lgaId/wards/:id`.
- It's a native `<dialog>` with combobox and listbox roles. Arrow keys move, Enter opens, Esc closes. `/` doesn't open it while you're typing in a field.

**Help.** [`pages/help/HelpPage.tsx`](../../client/src/pages/help/HelpPage.tsx) keeps topics and questions in one array. The search box filters by question and answer text. The administrator topic only shows for administrators. The roles answer comes from `ROLE_INFO`, so it always matches the role badges.

**Setup checklist.** [`pages/account/SetupChecklist.tsx`](../../client/src/pages/account/SetupChecklist.tsx) reads:

- `useCountries()`: per-level area counts tell it which levels are imported;
- the first 100 accounts from `useUsers()`: any staff role besides your own account means the team has access.

Each unfinished step links to the screen that does it, and only the next step shows its explanation.

**Users page.** [`pages/admin/AdminUsersPage.tsx`](../../client/src/pages/admin/AdminUsersPage.tsx) keeps `?q=` and `?role=` in the URL next to `?page=`. Changing either goes back to page 1. A search with no results offers **Clear filters**. [`hooks/useUsers.ts`](../../client/src/hooks/useUsers.ts) passes both to `GET /api/v1/users`. [`components/users/UserTable.tsx`](../../client/src/components/users/UserTable.tsx) looks up each scoped region's name with `useAdminUnit`, which is cached, so each area is fetched once.

**Navigation.** [`components/layout/nav-items.ts`](../../client/src/components/layout/nav-items.ts) has a new **Support** group with Help and Profile. The top bar has the search box, a help icon and the account menu.

**Tests.** Cypress:

- [`cypress/e2e/account/profile.cy.ts`](../../client/cypress/e2e/account/profile.cy.ts): new. Covers the name reminder, saving only changed fields, and server field errors.
- [`sign-up.cy.ts`](../../client/cypress/e2e/auth/sign-up.cy.ts): now fills in the name and checks that it's required.
- [`dashboard.cy.ts`](../../client/cypress/e2e/layout/dashboard.cy.ts): expects the new 228/64px sidebar widths.

Last run: the full suite passed 74 of 76. The profile spec failed once on a cold first load, then passed both tests when run again alone. The dashboard spec failed only on the old widths and was updated afterwards; it hasn't been re-run since. Unit tests and the server suite pass.

## Resources to read

- Inter typeface: https://rsms.me/inter/
- WAI-ARIA combobox pattern (quick search): https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- The `<dialog>` element: https://developer.mozilla.org/docs/Web/HTML/Element/dialog
- `<details>` / `<summary>` (Help answers): https://developer.mozilla.org/docs/Web/HTML/Element/details
- Firebase `updateProfile`: https://firebase.google.com/docs/auth/web/manage-users#update_a_users_profile
- react-hook-form `values` and dirty fields: https://react-hook-form.com/docs/useform

## Explain it like I'm new to this

The app used to feel like a form printed in large type: readable, but you had to scroll for everything. It now uses office-document sizing, so more fits on one screen. Your profile used to be a blank name tag. Now it asks for your name when you sign up, reminds you if it's missing, and lets you add your phone, organisation and role. Then the person approving your access knows who you are. For finding your way, there's a search bar that works like a phone's contact search ("obio" → Obio/Akpor), a Help page that answers the usual "how do I…" questions, and a to-do list for administrators that walks them through setting up the platform from empty.
