# Backend Documentation

Plain-language documentation for the Climate Intelligence & Disaster Management Platform backend ([`server/`](../server/)). It's written for someone who can read code but may be new to this stack. Every doc follows the same four parts, from section 18 of *Backend Engineering Standards*: **What was built**, **How it works**, **Resources to read**, and **Explain it like I'm new to this**.

## Suggested reading order

**Start here**
1. [architecture.md](architecture.md): the big picture. Layers, folders, and how a request flows through the code.
2. [phase-1-authentication.md](phase-1-authentication.md): Phase 1 end to end, including how sign-in with Firebase works.

**The building blocks** (read as needed)
3. [configuration-and-logging.md](configuration-and-logging.md): `.env` settings, startup checks, logging, CORS and security headers.
4. [database-connection-ssl.md](database-connection-ssl.md): connecting to the cloud database (Aiven) securely.
5. [database-and-migrations.md](database-and-migrations.md): entities, repositories, migrations, and the `roles`/`users` tables.
6. [errors-and-responses.md](errors-and-responses.md): the response envelope and how errors become responses.
7. [request-validation.md](request-validation.md): how incoming data is checked with Zod.
8. [access-control.md](access-control.md): the five roles and region scoping.
9. [pagination.md](pagination.md): offset and cursor paging for lists.

**Features and tools**
10. [user-management.md](user-management.md): the Administrator user endpoints and the first-admin script.
11. [testing.md](testing.md): running and writing tests.
12. [postman-collection.md](postman-collection.md): trying the API by hand.

**Deployment**
13. [deployment-render.md](deployment-render.md): running the API on Render, with first-time setup steps.

## Adding a new doc

Every feature, endpoint or migration ships with its own `docs/<feature-name>.md` in the four-part format above. It isn't finished without one (standard sections 12, 13 and 18). Add it to this list, and link to it from any related doc.
