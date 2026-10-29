# Documentation

Plain-language documentation for the Climate Intelligence & Disaster Management Platform: the backend ([`server/`](../server/)) and the web client ([`client/`](../client/)). It's written for someone who can read code but may be new to this stack. Every doc follows the same four parts, from section 18 of *Backend Engineering Standards* (section 22 of the frontend one): **What was built**, **How it works**, **Resources to read**, and **Explain it like I'm new to this**.

## Suggested reading order

**Want to try it rather than read about it?** [user-stories.md](user-stories.md) walks through everything built so far as user stories, with steps to follow in the running app and what you should see.

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

**Phase 2: Admin Geography**
13. [admin-geography.md](admin-geography.md): countries, the state, LGAs and wards, map layers, point-in-polygon, region scoping on real areas, and the first-administrator setting.
14. [data-import.md](data-import.md): the import pipeline (file, staging, checks, promote), and how the real Rivers State files were loaded.
15. [shapefile-and-csv-imports.md](shapefile-and-csv-imports.md): reading shapefiles (`.shp`, or a `.zip` with its `.dbf` and `.prj`), CSV files and zips; what each part of a shapefile is, and the coordinate-system rules.
16. [user-profiles.md](user-profiles.md): profile details (phone, organisation, job title), `PATCH /api/v1/auth/me`, and searching and filtering the user list.

**Phase 3: Map layers**
17. [map-layers.md](map-layers.md): roads, waterways and settlements: the tables, the four read endpoints, thinning by zoom and the cap, the `npm run layers:load` and `npm run layers:clear` scripts, and the country-delete `409`.
18. [infrastructure-layer.md](infrastructure-layer.md): facilities from the Geofabrik OpenStreetMap extract: the `infrastructure` table, the GeoPackage reader, `GET /api/v1/infrastructure/geojson`, loading and clearing, and what else the extract holds.
19. [buildings-layer.md](buildings-layer.md): building outlines from the same extract: the `buildings` table, recovering a GeoPackage that was cut short in transit, `GET /api/v1/buildings/geojson` (street level only), and streaming the load so the Imports screen can take it.

**Deployment**
20. [deployment-render.md](deployment-render.md): running the API on Render, with first-time setup steps.

## Web client ([`client/`](../client/))

Frontend docs live in [`features/`](features/), per section 22 of *Frontend Engineering Standards*. They use the same four parts.

21. [features/phase-1-client.md](features/phase-1-client.md): the client's Phase 1 overview. Start here for the frontend.
22. [features/client-architecture.md](features/client-architecture.md): layers, folders, configuration, and the lint rules that enforce the standard.
23. [features/signing-in-with-firebase.md](features/signing-in-with-firebase.md): sign-in, sign-up, password reset, `AuthContext` and the route guards.
24. [features/ui-foundations.md](features/ui-foundations.md): design tokens, light/dark theme, shared components, Modal and toasts.
25. [features/admin-user-management-ui.md](features/admin-user-management-ui.md): the Administrator Users page.
26. [features/client-testing.md](features/client-testing.md): unit tests and the offline Cypress suite.
27. [features/client-deployment-vercel.md](features/client-deployment-vercel.md): putting the client on Vercel.
28. [features/auth-email-templates.md](features/auth-email-templates.md): the verification and password-reset emails, and the Firebase console settings behind them.
29. [features/admin-geography.md](features/admin-geography.md): Phase 2 on the client: the dashboard sidebar and top bar, the home map, Places, and the admin Countries and Imports screens.
30. [features/email-verification-before-sign-in.md](features/email-verification-before-sign-in.md): new accounts aren't signed in until their email is verified.
31. [features/usability-and-profile.md](features/usability-and-profile.md): the compact layout, the profile page, name at sign-up, quick search (Ctrl+K), the Help page, the admin setup checklist, and user search on the Users page.
32. [features/map-layers.md](features/map-layers.md): the Roads, Waterways and Settlements toggles, their legend rows, the Data sources panel, and the layer-toggle fix on the home map.

## Adding a new doc

Every feature, endpoint or migration ships with its own `docs/<feature-name>.md` (backend) or `docs/features/<feature-name>.md` (client) in the four-part format above. It isn't finished without one (standard sections 12, 13 and 18). Add it to this list, and link to it from any related doc.
