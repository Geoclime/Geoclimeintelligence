# User Management (Administrator)

## What was built

Endpoints that let an Administrator see every account and change what each person may do: their role, and for staff their region. There's also a command-line script to create the very first Administrator. Every new account starts with the lowest access, so this is how real staff (responders, officials, researchers) get their permissions.

## How it works

All paths are relative to `server/`. Every route here is Administrator-only.

**The endpoints.** They're mounted at `/api/v1/users` in [`app.ts`](../server/src/app.ts) and defined in [`src/modules/users/user.routes.ts`](../server/src/modules/users/user.routes.ts):

| Method & path | What it does | Success |
|---|---|---|
| `GET /api/v1/users?page=1&pageSize=25` | Lists accounts, oldest first | `200` with `meta: { page, pageSize, total }` |
| `GET /api/v1/users/:id` | Returns one account | `200` |
| `PATCH /api/v1/users/:id/access` | Changes `role` and/or `scopeAdminUnitId` | `200 User access updated` |

`GET /api/v1/auth/me` (any signed-in user) is covered in [phase-1-authentication.md](phase-1-authentication.md).

**What a PATCH request goes through**, in order:
1. `authMiddleware` and `resolveUserMiddleware` in `app.ts` establish who's calling.
2. `authorise("administrator")` rejects everyone else with `403`.
3. `validate(updateUserAccessSchema)` from [`user.validation.ts`](../server/src/modules/users/user.validation.ts) requires `:id` to be a UUID. The body may contain only `role` (one of the five) and/or `scopeAdminUnitId` (a UUID, or `null` to remove the scope), and at least one of them. Anything else gets `400`.
4. `UserController.updateAccess` in [`user.controller.ts`](../server/src/modules/users/user.controller.ts) passes the id, the body and the calling admin to the service.
5. `UserService.updateAccess` in [`user.service.ts`](../server/src/modules/users/user.service.ts) applies the rules:
   - **You can't change your own access** (`403`), so an Administrator can't accidentally demote or lock out themselves.
   - **The target must exist** (`404 User not found`).
   - **Fields you leave out keep their current value.** If you send only `role`, the existing scope stays.
   - **The scope must suit the role** (`400`). A scope is only allowed on `emergency_responder` and `government_official`. This also catches a quieter mistake: changing a scoped responder to `researcher` *without* clearing the scope is rejected, and the error message tells you to send `scopeAdminUnitId: null`.
6. `UserRepository.updateAccess` saves the change and returns the updated row. The service converts it into the response shape (`UserDto`: dates as ISO strings).

```http
PATCH /api/v1/users/7a9e4c21-0b3d-4f58-a6c7-8d9e0f1a2b3c/access
Authorization: Bearer <admin's Firebase ID token>
Content-Type: application/json

{ "role": "emergency_responder", "scopeAdminUnitId": "3f1c2b8e-5a4d-4e6f-9b7a-1c2d3e4f5a6b" }
```

**The first Administrator.** Nobody can use the API to promote the first admin, because nobody is an admin yet. Since Phase 2 the simplest way is the `BOOTSTRAP_ADMIN_EMAIL` setting in `server/.env`. When that email signs in with a **verified** Firebase email while the platform has **no administrator**, its account becomes one. Once any administrator exists the setting does nothing (details in [admin-geography.md](admin-geography.md)). The command-line script below still works, for recovery or if you'd rather not use the setting. [`src/scripts/set-user-access.ts`](../server/src/scripts/set-user-access.ts) does it directly in the database:

```bash
# 1. Sign up (Postman "Auth → Firebase: sign up", or the client app)
# 2. Call GET /api/v1/auth/me once with that token, which creates your users row
# 3. Then:
npm run user:set-access -- --email you@example.com --role administrator
npm run user:set-access -- --email responder@example.com --role emergency_responder --scope <admin-unit-uuid>
```

The script checks its arguments with Zod and applies the same "scope must suit the role" rule. It finds the user by email, ignoring upper/lower case, updates them, and prints the result. If the user hasn't called the API yet, it says so and exits with an error. Running it needs the database password (`DATABASE_URL`), and that's what limits it to administrators. It's the documented exception to the region-check rule (AI rule 9).

**Tests:** [`tests/unit/user.service.test.ts`](../server/tests/unit/user.service.test.ts) covers promotion, self-change refused, unknown user, scope on the wrong role, and the inherited-scope case. [`tests/integration/app.test.ts`](../server/tests/integration/app.test.ts) covers the full HTTP path: listing with `meta`, `403` for non-admins, field-level `400`s, and rejection of unknown body fields.

**Flagged for the team (NEEDS VERIFICATION):**
- Phase 2 done: `scopeAdminUnitId` must be a real admin unit. An unknown id gets a field-level `400` (`scopeAdminUnitId: No area with this id exists`) from `UserService`, the `users` → `admin_units` foreign key backs that up, and the script checks it too.
- There's no audit log of who changed whose access, or when. Decide whether one is needed before real staff accounts are managed.
- There's no endpoint to delete or deactivate an account. Firebase accounts can be disabled in the Firebase console; decide whether the API needs its own version.

## Resources to read

- HTTP PATCH (partial update): https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods/PATCH
- The `Authorization: Bearer` header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
- Zod: https://zod.dev
- Node's built-in argument parser used by the script: https://nodejs.org/api/util.html#utilparseargsconfig
- OWASP authorisation guide: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html

## Explain it like I'm new to this

Everyone who joins gets a visitor badge automatically. The Administrator is the HR office that can swap your badge for a staff one: "Emergency Responder, East Wing only". HR follows a few house rules. They can't change their own badge, so nobody locks themselves out by accident. They can't give a wing assignment to someone whose job doesn't have wings. And if they change your job title, they must also decide what happens to your old wing assignment. But on day one there's no HR person at all, so the building owner uses a master key in the back office (the `set-user-access` script) to make the first HR person. After that, everything goes through HR at the front desk (the API).
