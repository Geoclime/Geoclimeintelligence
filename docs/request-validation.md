# Request Validation

## What was built

A checkpoint that inspects every incoming request's data (the JSON body, the `?query=string` and the `/:id` parts of the URL) against a written description of what's allowed, before any business code sees it. Bad input is turned away with a `400` that lists every problem, and the code behind the checkpoint can trust that its input is well-formed.

## How it works

All paths are relative to `server/`.

1. **Each route has a schema.** Schemas live next to the feature in a `*.validation.ts` file. [`src/modules/users/user.validation.ts`](../server/src/modules/users/user.validation.ts) is the example. A schema is written with **Zod** and describes the three parts of a request together:

   ```ts
   export const updateUserAccessSchema = z.object({
     params: z.object({ id: z.uuid() }),              // /users/:id must be a UUID
     body: z.object({
       role: z.enum(USER_ROLES).optional(),           // one of the five roles
       scopeAdminUnitId: z.uuid().nullable().optional(),
     })
       .strict()                                      // unknown fields are an error, not ignored
       .refine((b) => b.role !== undefined || b.scopeAdminUnitId !== undefined,
               { message: "Provide role, scopeAdminUnitId, or both" }),
   });
   ```

2. **The route plugs it in.** In [`user.routes.ts`](../server/src/modules/users/user.routes.ts), `validate(updateUserAccessSchema)` sits between the role check and the controller.

3. **`validate` runs it.** [`src/middleware/validate.middleware.ts`](../server/src/middleware/validate.middleware.ts) checks `{ body, query, params }` against the schema:
   - **On failure** it throws a `ValidationError` holding every problem at once, not just the first. The `body.`/`query.`/`params.` prefix is dropped from field names, so the client sees `"field": "role"` and not `"body.role"`. The error handler turns this into a `400` (see [errors-and-responses.md](errors-and-responses.md)).
   - **On success** it *replaces* the request's data with the parsed result. Defaults and conversions therefore reach the controller: `?page=2` arrives as the number `2`, and a missing `pageSize` arrives as `25`. Express 5 makes `req.query` read-only, so the middleware redefines it rather than assigning to it.

4. **Shared schemas.** The pagination rules (`page`, `pageSize`, `cursor`, `limit`) are written once in [`src/common/pagination/pagination.ts`](../server/src/common/pagination/pagination.ts) and reused. See [pagination.md](pagination.md).

**Validation isn't the only check.** Zod checks *shape*: "is this a valid UUID?". A service checks *meaning*: "does this user exist?" (404), or "is this role allowed a region scope?" (`assertScopeAllowedForRole` in [`roles.ts`](../server/src/common/access/roles.ts)). For the most important rules, the database checks again with constraints. Three gates means a bug in one still can't let bad data through.

**Coming in later phases** (standard section 4): every write to the core data tables will have to include a `dataType` (`OBSERVED`, `DERIVED`, `MODELLED`, `ESTIMATED` or `SYNTHETIC`) and a `sourceId`. Geometry will be checked for valid GeoJSON, `[longitude, latitude]` order, coordinate ranges and closed polygons, in EPSG:4326 (the ordinary GPS latitude/longitude system) only. None of that exists yet, because there are no data tables in Phase 1.

## Resources to read

- Zod documentation: https://zod.dev
- Express 5 changes (including `req.query` being read-only): https://expressjs.com/en/guide/migrating-5.html
- OWASP input validation guide: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- What a UUID is: https://developer.mozilla.org/en-US/docs/Glossary/UUID

## Explain it like I'm new to this

A Zod schema is like a form template with rules printed on it: "ID must be in this format", "role must be one of these five", "don't write anything in the margins". The `validate` middleware is the clerk at the counter who checks your form against the template before it goes any further. If there are mistakes, the clerk hands it back with *every* wrong box circled, so you can fix them all in one go. If it's fine, the clerk tidies it up first (turns "2" into the number 2, fills in blank boxes that have a standard default) and then passes it on. The officers behind the counter never waste time on a half-filled or scribbled form.
