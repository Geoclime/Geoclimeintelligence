# Role Requests: Asking for Staff Access

## What was built

Nobody chooses their own role. Every account starts as **General Public**. Someone who works in emergency response, government or research **asks** for that role, and an administrator approves or declines it.

- **Sign-up** has an "I'm joining as" choice: member of the public, emergency responder, government official or researcher. A staff choice asks for the organisation, an optional job title, and a reason (10 to 500 characters).
- **The profile page** has a *Staff access* card. It shows an open request (role, date, reason) with *Withdraw request*, or offers *Request a role* when there is none. Administrators don't see it.
- **The Users page** has an *Open role requests* filter (`?requests=open`, oldest request first) and an "Asks for …" badge on each such account. Opening one shows the reason and organisation. The dialog starts on the requested role, so *Approve as …* approves it. *Decline request* closes it and leaves the role unchanged.

| Endpoint | Who | Does |
|---|---|---|
| `PUT /api/v1/auth/me/role-request` | Any signed-in user | Opens or replaces their request; saves the organisation and job title to their profile |
| `DELETE /api/v1/auth/me/role-request` | Any signed-in user | Withdraws it (safe to repeat) |
| `PATCH /api/v1/users/:id/access` | Administrator | Giving the requested role closes the request; any other change leaves it open |
| `DELETE /api/v1/users/:id/role-request` | Administrator | Declines it (409 if there is none) |
| `GET /api/v1/users?pendingRequest=true` | Administrator | Only accounts with an open request |

## How it works

**1. Why not let people pick?** Staff roles unlock more data and, later, the right to create and change records in a region. A self-chosen role would let anyone give themselves that. A request grants nothing until an administrator approves it.

**2. Storage.** Migration `1791800000000-AddRoleRequests` adds `requested_role`, `role_request_reason` and `role_requested_at` to `users`:
- One open request per user.
- A CHECK allows only `emergency_responder`, `government_official` and `researcher`, so administrator can only ever be given, never asked for.
- A second CHECK keeps the three columns set or cleared together.
- A partial index serves the open-requests filter.

`UserDto.roleRequest` is `{ role, reason, requestedAt }` or `null`.

**3. Sign-up can't send the request itself.** A new account isn't signed in until its email is verified, so the server can't be called yet. The sign-up form keeps the request in this browser (`client/src/utils/pending-role-request.ts`), keyed by email and kept for 30 days. `useSubmitPendingRoleRequest`, mounted in the signed-in shell, sends it after the first sign-in and shows a toast. If sending fails, the request is kept and retried at the next sign-in. Someone who verifies on another device can ask from the profile page instead.

**4. Shared form pieces.** `components/users/RoleRequestFields.tsx` (`RolePicker`, `RoleRequestDetails`) and `role-request.schema.ts` serve both the sign-up form and the profile card. The server re-checks everything (`roleRequestSchema`, strict).

**Tests:**
- `server/tests/unit/role-request.test.ts`: the request grants nothing; refusals; approve closes it, other changes keep it, decline, the filter.
- `client/src/utils/pending-role-request.test.ts`: the browser-side handover.
- `client/cypress/e2e/auth/role-request.cy.ts`: sign-up fields, the profile status and withdraw, admin approve and decline.

## Resources to read

- OWASP, "Authorization Cheat Sheet" (deny by default, least privilege): https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- PostgreSQL, "Partial indexes": https://www.postgresql.org/docs/current/indexes-partial.html

## Explain it like I'm new to this

It's like a building pass. Anyone can get a visitor pass at the front desk. If you work there, you fill in a form saying which team you're on and why you need staff access, and a manager signs it off. Until then, your visitor pass still works; you just can't open the staff doors. Nobody can print their own staff pass.
