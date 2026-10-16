# User Profiles and User Search

## What was built

- **Profile details on every account.** The `users` table has three new optional columns: `phone`, `organisation` and `job_title`. They sit next to the existing `display_name`.
- **`GET /api/v1/auth/me` returns the whole profile.** Before, it returned only the access fields (`id`, `email`, `displayName`, `role`, `scopeAdminUnitId`). Now it also returns `phone`, `organisation`, `jobTitle`, `createdAt` and `updatedAt`, the same shape as an account in the admin user list.
- **`PATCH /api/v1/auth/me`.** Any signed-in user can edit their own name and contact details. It can't change a role or region scope.
- **Search and role filter on `GET /api/v1/users`.** Administrators can search by name, email or organisation (`?q=`) and filter by role (`?role=`).

None of the new fields grant anything. Access still comes only from `role` and `scope_admin_unit_id` ([access-control.md](access-control.md)).

## How it works

**Migration.** [`1791300000000-AddUserProfileFields.ts`](../server/src/migrations/1791300000000-AddUserProfileFields.ts) adds `phone varchar(32)`, `organisation varchar(200)` and `job_title varchar(120)`. All three are nullable, so existing rows don't change. The [`User`](../server/src/modules/users/user.entity.ts) entity maps them as `phone`, `organisation` and `jobTitle`. Apply it with `npm run migration:run` in `server/` ([database-and-migrations.md](database-and-migrations.md)). It has been applied to the Aiven database in `server/.env`.

**Reading your profile.** `AuthController.me` calls `AuthService.getProfile(req.user)`. That reads the row by id and returns `toUserDto(row)`. `req.user` itself is unchanged: middleware and services still get the small `AuthUser`.

**Editing your profile.** `PATCH /api/v1/auth/me` → `validate(updateProfileSchema)` ([`auth.validation.ts`](../server/src/modules/auth/auth.validation.ts)) → `AuthController.updateProfile` → `AuthService.updateProfile` → `UserRepository.updateProfile`.

| Field | Rule |
| --- | --- |
| `displayName` | Up to 200 characters |
| `phone` | Up to 32 characters. Digits, spaces, `()` and `-`, with an optional leading `+` |
| `organisation` | Up to 200 characters |
| `jobTitle` | Up to 120 characters |

- Values are trimmed. An empty string or `null` clears the field.
- At least one field must be sent.
- The schema is **strict**: a body with `role` or `scopeAdminUnitId` gets `400`. It isn't silently ignored, so a client can't think it changed its own access.

```http
PATCH /api/v1/auth/me
Authorization: Bearer <firebase-id-token>
Content-Type: application/json

{ "displayName": "Ada Obi", "phone": "+234 803 123 4567", "organisation": "RSEMA" }
```

The reply is `200 Profile updated` with the full updated profile.

**Names from sign-up.** The web client's sign-up form now asks for a full name and saves it on the Firebase account. It travels in the ID token's `name` claim, and `AuthService.resolveUser` already copies that into `display_name` when it creates the row on first sign-in. So new accounts start with a name.

**Searching users.** [`user.validation.ts`](../server/src/modules/users/user.validation.ts) adds two optional query parameters to `listUsersSchema`:

- `q`: up to 100 characters, trimmed.
- `role`: one of the five roles.

`UserRepository.findPage` builds the query with `ILIKE` on `email`, `display_name` and `organisation`. It escapes `%`, `_` and `\` so they match literally. Results stay ordered oldest first, and `meta.total` counts only the matching accounts.

```http
GET /api/v1/users?q=emergency&role=emergency_responder&page=1&pageSize=25
```

**Tests.** [`tests/integration/app.test.ts`](../server/tests/integration/app.test.ts) covers:

- reading the profile;
- trimming and clearing values;
- rejecting a `role` change through this route;
- rejecting an empty body and a malformed phone number;
- filtering by role;
- searching by organisation.

The in-memory fake in [`tests/fakes.ts`](../server/tests/fakes.ts) implements the same filters.

## Resources to read

- TypeORM migrations: https://typeorm.io/docs/advanced-topics/migrations
- PostgreSQL pattern matching (`ILIKE`, escaping): https://www.postgresql.org/docs/current/functions-matching.html
- Zod objects and `.strict()`: https://zod.dev/api#objects
- Firebase ID token claims: https://firebase.google.com/docs/auth/admin/verify-id-tokens

## Explain it like I'm new to this

Think of each account as a staff badge. The **role** printed on it decides which doors open, and only the building manager (an administrator) can reprint it. This change adds a name card in the badge sleeve: your name, phone, organisation and job title. You can rewrite your own name card whenever you like. The door locks never read it. It's there so the manager knows who they're looking at before upgrading a badge, and so they can find "the person from RSEMA" by searching for it.
