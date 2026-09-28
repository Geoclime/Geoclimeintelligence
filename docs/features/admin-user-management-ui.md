# Admin User Management (Web)

## What was built

The **Users** page at `/admin/users`, visible only to Administrators. It lists every account, 25 per page, with role, region and join date. An Administrator can open **Edit access** on any account except their own, pick one of the five roles, and optionally limit an Emergency Responder or Government Official to one region. It's the screen version of the backend endpoints in [user-management.md](../user-management.md).

## How it works

All paths are relative to `client/src/`. The flow follows the standard's scaffold order (section 17).

1. **Endpoints:** [`endpoints/user.endpoints.ts`](../../client/src/endpoints/user.endpoints.ts): `fetchUsers({ page, pageSize })` → `GET /api/v1/users`, and `updateUserAccess(id, patch)` → `PATCH /api/v1/users/:id/access`.
2. **Hooks:** [`hooks/useUsers.ts`](../../client/src/hooks/useUsers.ts) loads one page and returns `users`, `loading`, `error`, `total`, `hasNext`/`hasPrev`, `refetch`, and `replaceUser` (to update one row after a save without reloading the list). If you page quickly, an older response that arrives late is ignored. [`hooks/useUpdateUserAccess.ts`](../../client/src/hooks/useUpdateUserAccess.ts) wraps the PATCH.
3. **Page:** [`pages/admin/AdminUsersPage.tsx`](../../client/src/pages/admin/AdminUsersPage.tsx) keeps the page number in the URL (`?page=2`), so a refresh or a shared link shows the same page (section 9). It uses the shared loading, error and empty states. It even handles a URL like `?page=99` with a "Go to the first page" button.
4. **Table:** [`components/users/UserTable.tsx`](../../client/src/components/users/UserTable.tsx). Your own row is marked **You** and can't be edited, because the backend refuses self-edits so an Administrator can't lock themselves out. On phones each row turns into a stacked card.
5. **The access form:** [`components/users/UserAccessDialog.tsx`](../../client/src/components/users/UserAccessDialog.tsx) inside the shared Modal. The role picker shows each role's description, taken from the same wording as the backend's `roles` table ([`utils/roles.ts`](../../client/src/utils/roles.ts)). The region field only appears for the two roles that can have one. **Save** stays disabled until something changes.
6. **Validation:** [`components/users/user-access.schema.ts`](../../client/src/components/users/user-access.schema.ts) uses the backend's field names (`role`, `scopeAdminUnitId`) and checks that a region ID is a UUID. `toAccessPatch()` always sends both fields and sends `scopeAdminUnitId: null` for roles that can't be scoped. Without that, the backend would keep the old region and then reject the combination.
7. **Server errors land on the right field.** If the backend answers `400` with `errors: [{ field: "scopeAdminUnitId", … }]`, [`utils/form-errors.ts`](../../client/src/utils/form-errors.ts) puts the message under that input. Anything else shows at the top of the form.
8. **Success:** the row updates in place, the dialog closes, and a toast says e.g. "responder@example.com is now Emergency Responder." The change applies to that person's next request, because the backend reads roles fresh each time.

**Security note.** Hiding the page and the menu item from non-administrators is only for convenience. The backend's `authorise("administrator")` returns `403` to anyone else, whatever the UI does.

**Region IDs for now.** Admin units (LGAs, wards) arrive in Phase 2. Until then the region is typed as its UUID, and names can't be shown. Replace the text field with a picker once an admin-units endpoint exists.

## Resources to read

- react-hook-form, getting started: https://react-hook-form.com/get-started
- Zod resolver for react-hook-form: https://github.com/react-hook-form/resolvers
- Zod: https://zod.dev
- React Router, data routing (URL search params): https://reactrouter.com/start/data/routing
- WAI-ARIA dialog (modal) pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

## Explain it like I'm new to this

This page is the building manager's key cabinet. Every visitor starts with a basic lobby pass. The manager can swap someone's pass for a staff one (a role) and, for field staff, write one district on it (a region scope) so it only opens doors there. The manager can't re-cut their own key, so they can't lock themselves out by accident. And the cabinet being hidden from visitors isn't what keeps it safe: the locks on every door (the backend) check each pass anyway.
