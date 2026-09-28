# Response Envelope & Error Handling

## What was built

One consistent shape for every response the API sends, successful or not, and one central place that turns errors into those responses. A frontend developer can then handle every endpoint the same way, and users never see internal details such as stack traces when something breaks.

## How it works

All paths are relative to `server/`.

**1. The envelope.** [`src/common/response/api-response.ts`](../server/src/common/response/api-response.ts) defines the one shape (section 5 of the standard):

```jsonc
// success
{ "success": true,  "data": { ... },  "message": "OK", "meta": { "page": 1, "pageSize": 25, "total": 3 } }
// failure
{ "success": false, "data": null, "message": "Validation failed",
  "errors": [ { "field": "scopeAdminUnitId", "message": "Invalid UUID" } ] }
```

`meta` appears only on paginated lists, and `errors` only when there are field-level problems. Controllers build success responses with `ok(data, message?, meta?)`. The error handler builds failures with `fail(message, errors?)`. Nobody writes the shape by hand.

**2. Errors are thrown, not returned.** [`src/common/errors/app-error.ts`](../server/src/common/errors/app-error.ts) defines `AppError`, an error that carries an HTTP status code, and one subclass per common case:

| Class | Status | When |
|---|---|---|
| `ValidationError` | 400 | Input failed a schema or business rule. It carries a per-field `errors` list |
| `UnauthorizedError` | 401 | No token, or an invalid or expired one |
| `ForbiddenError` | 403 | Signed in, but the role or region doesn't allow this |
| `NotFoundError` | 404 | `new NotFoundError("User")` gives the message "User not found" |
| `UnprovenDataError` | 422 | A data write without a valid `dataType`/`sourceId`. Defined now, first used in Phase 3 (standard section 4) |

A service simply throws, for example `throw new NotFoundError("User")`, and doesn't need to know anything about HTTP.

**3. How a thrown error reaches the client.** Express 5 automatically forwards errors thrown inside async middleware to the error handler. Controllers also wrap their body in `try { ... } catch (err) { next(err) }`, as section 6 of the standard asks. Either way the error lands in `errorHandler` in [`src/middleware/error-handler.middleware.ts`](../server/src/middleware/error-handler.middleware.ts), which [`app.ts`](../server/src/app.ts) mounts last. It decides like this:
- **An `AppError`** gets its own status code and message, plus the `errors` list if there is one. If the status is 500 or higher, the error is also logged.
- **A malformed or oversized JSON body** comes from Express's body parser, not our code. It becomes `400 Malformed request body` or `413 Request body too large`.
- **Anything else** is a bug or an outage, such as the database being down. It's logged in full on the server with the method, path and user id, and the client gets only `500 Something went wrong`. Stack traces never go to the client, not even in development.

**4. Unknown routes.** `notFoundHandler` (same file) answers `404 Route GET /whatever not found`. Authentication is mounted for all of `/api/v1` before the routers, so an unknown path under `/api/v1` *without a token* gets `401`, not `404`. The API checks who you are before it says whether a route exists.

**Where to see it working:** the "error handling" tests in [`tests/integration/app.test.ts`](../server/tests/integration/app.test.ts) cover malformed JSON, a hidden 500 and an unknown route. The Postman collection has an example response for every status each endpoint can return.

## Resources to read

- Express error handling: https://expressjs.com/en/guide/error-handling.html
- HTTP status codes: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
- JavaScript `Error` and `throw`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error
- Why error details stay out of responses (OWASP): https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html

## Explain it like I'm new to this

Every letter the API sends uses the same printed form: a tick-box for "success", a space for the answer, a one-line note, and, if you got something wrong, a list pointing at which boxes on your form were bad. When something goes wrong deep inside the office, the worker doesn't write back to you themselves. They fill in a standard incident slip ("not found", "not allowed", "bad input") and drop it in the tray. One person (`errorHandler`) empties that tray and turns each slip into a reply on the standard form. If a slip says something the office didn't plan for, like "the filing cabinet caught fire", they write the details in the internal logbook and just tell you "Something went wrong". You don't need to know about the cabinet, and publishing it could help someone attack us.
