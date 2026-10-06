# Access Control: Roles & Region Scoping

## What was built

The rules that decide *what* each signed-in person may do and *where* they may do it. Every account has one of five **roles**, such as Emergency Responder or Administrator. Some staff accounts are also limited to one **region**, for example a single Local Government Area. Every future feature (disaster events, alerts, risk data) uses these same checks, so they were built in Phase 1, before any of that data exists.

## How it works

All paths are relative to `server/`. Identity ("who are you?") comes from Firebase; see [phase-1-authentication.md](phase-1-authentication.md). This doc starts once `req.user` is set.

**1. The five roles.** They're listed in [`src/common/access/roles.ts`](../server/src/common/access/roles.ts) and stored in the `roles` table by the Phase 1 migration:

| Role (code) | May do | Can be region-scoped? |
|---|---|---|
| General Public (`general_public`) | Read published events, risk layers and alerts | No |
| Emergency Responder (`emergency_responder`) | Public reads, plus create/update event reports in their region | **Yes** |
| Government Official (`government_official`) | Responder access in their region, plus analytics and dashboards | **Yes** (or null = state-wide) |
| Researcher (`researcher`) | Full historical data, including unpublished, plus exports | No |
| Administrator (`administrator`) | Everything, including user and data-source management | No, never restricted |

New accounts always start as `general_public` (`DEFAULT_ROLE`). Only an Administrator can raise a role; see [user-management.md](user-management.md).

**2. Check one: the role, on the route.** [`src/middleware/authorise.middleware.ts`](../server/src/middleware/authorise.middleware.ts) provides `authorise(...roles)`, which a route adds to say who may call it:

```ts
usersRouter.get("/", authorise("administrator"), validate(listUsersSchema), UserController.list);
```

If `req.user.role` isn't in the list, the request stops with `403 Your role is not permitted to perform this action`. Administrators always pass, so routes never need to list them. This check is cheap (no database), so it runs first.

**3. Check two: the region, in the service.** A user's `scopeAdminUnitId` says where they may act. `null` means anywhere. A value means "only inside this admin unit, including any smaller units within it". [`src/common/access/region-access.ts`](../server/src/common/access/region-access.ts) provides two functions that services call:
- **`assertRegionAccess(user, adminUnitId)`** is for acting on one record. It throws `403` if the record's region is outside the user's scope.
- **`applyRegionScope(query, user)`** is for lists. It never throws. It adds `scopeAdminUnitIds` (the user's region plus everything inside it) to the query, and the repository filters with `WHERE admin_unit_id IN (...)`. A scoped user's list quietly shows only their area.

The region check lives in the service, not the route, because it needs to know *which* record is involved and needs a database lookup to walk the region tree.

**4. The region tree (Phase 2).** Knowing that "Ward X is inside LGA Y" needs the `admin_units` table. Since Phase 2, `RegionAccess` uses `AdminUnitRepository` as its hierarchy: recursive queries walk `admin_units.parent_id` up (`isDescendantOrSelf`) and down (`subtreeIds`). A responder scoped to an LGA can therefore act on that LGA's wards. Phase 1's stand-in, which treated a region as containing only itself, is gone; services didn't change, because they talk to the `RegionHierarchy` interface. A scope pointing at an area that doesn't exist still fails closed: its subtree is empty, so it matches nothing. [`tests/unit/region-access.test.ts`](../server/tests/unit/region-access.test.ts) tests the behaviour against a small made-up tree (state → LGA → ward) and the stale-scope case. See [admin-geography.md](admin-geography.md).

**5. Who may be scoped: enforced twice.** Only Emergency Responders and Government Officials may have a region. `assertScopeAllowedForRole` in `roles.ts` rejects anything else with a `400`, and the database has a `CHECK` constraint (`ck_users_scope_only_for_staff`) with the same rule. The API and the admin script both call the code check, and the database catches anything that slips past.

**Current state, honestly:** no Phase 1 endpoint uses the region check yet, because there's no region-tagged data to protect. The only protected routes are the Administrator-only user-management routes. Administrators are never scoped, so the region check doesn't apply to them; that's the documented exception in AI rule 9. Phase 4 (disaster events) is the first real user of `assertRegionAccess` and `applyRegionScope`.

**Flagged for the team (NEEDS VERIFICATION):**
- Should a staff promotion require the person's email to be verified in Firebase first? Right now it doesn't. (The Phase 2 first-administrator setting does require it.)
- Phase 2 done: `scopeAdminUnitId` must now be a real admin unit, checked by `UserService` (`400`) and by the `fk_users_scope_admin_unit` foreign key (`ON DELETE RESTRICT`, so deleting an area can never widen anyone's access).

## Resources to read

- Role-based access control (NIST overview): https://csrc.nist.gov/projects/role-based-access-control
- OWASP authorisation guide ("deny by default"): https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- Express middleware (how `authorise` plugs into a route): https://expressjs.com/en/guide/using-middleware.html
- PostgreSQL CHECK constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- Recursive queries (how the region tree is walked): https://www.postgresql.org/docs/current/queries-with.html

## Explain it like I'm new to this

Think of a hospital. Your job title (role) decides which *kinds* of rooms you may enter: a visitor can go to the waiting area, a nurse can go on wards, and the hospital director can go anywhere. A guard at each door checks your title, and that's `authorise`. Some staff are also assigned to one wing: a nurse on the East Wing can enter any ward *in the East Wing*, but not the West Wing's wards. That's region scoping. It's checked by the person handling your specific request, because only they know which ward the patient is in. To know which wards belong to which wing, they consult the hospital's floor plan, which is the `admin_units` table, delivered in Phase 2. If a nurse's badge names a wing that isn't on the plan, they're let in nowhere: an unknown wing never means "everywhere".
