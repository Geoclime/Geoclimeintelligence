# Documentation

Plain-language documentation for the Climate Intelligence & Disaster Management Platform: the backend ([`server/`](../server/)) and the web client ([`client/`](../client/)). It's written for someone who can read code but may be new to this stack. Every doc follows the same four parts, from section 18 of *Backend Engineering Standards* (section 22 of the frontend one): **What was built**, **How it works**, **Resources to read**, and **Explain it like I'm new to this**.

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

## Web client ([`client/`](../client/))

Frontend docs live in [`features/`](features/), per section 22 of *Frontend Engineering Standards*. They use the same four parts.

14. [features/phase-1-client.md](features/phase-1-client.md): the client's Phase 1 overview. Start here for the frontend.
15. [features/client-architecture.md](features/client-architecture.md): layers, folders, configuration, and the lint rules that enforce the standard.
16. [features/signing-in-with-firebase.md](features/signing-in-with-firebase.md): sign-in, sign-up, password reset, `AuthContext` and the route guards.
17. [features/ui-foundations.md](features/ui-foundations.md): design tokens, light/dark theme, shared components, Modal and toasts.
18. [features/admin-user-management-ui.md](features/admin-user-management-ui.md): the Administrator Users page.
19. [features/client-testing.md](features/client-testing.md): unit tests and the offline Cypress suite.
20. [features/client-deployment-vercel.md](features/client-deployment-vercel.md): putting the client on Vercel.

## Adding a new doc

Every feature, endpoint or migration ships with its own `docs/<feature-name>.md` (backend) or `docs/features/<feature-name>.md` (client) in the four-part format above. It isn't finished without one (standard sections 12, 13 and 18). Add it to this list, and link to it from any related doc.
