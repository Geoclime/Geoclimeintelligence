import { defineConfig } from "cypress";

// Runs against `npm run dev:e2e` (vite --mode e2e on port 5174): the fake identity provider
// replaces Firebase and every API call is stubbed, so a run never touches a real backend,
// database or Firebase project (standard section 21). Start both with `npm run e2e`.
export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5174",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 1280,
    viewportHeight: 800,
    video: false,
    retries: { runMode: 1, openMode: 0 },
  },
});
