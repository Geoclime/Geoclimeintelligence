import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Tests never touch a real database or Firebase; these only satisfy env validation.
    // DATABASE_SSL must be pinned to "false" too: data-source.ts reads DATABASE_SSL_CA off
    // disk as soon as it's imported, and that path is only ever valid on the machine that
    // wrote .env (build/CI environments don't have it), so a real SSL cert must never be
    // requested here regardless of what a developer's local .env happens to contain.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgres://test:test@localhost:5432/unused",
      DATABASE_SSL: "false",
      FIREBASE_PROJECT_ID: "test-project",
      CORS_ORIGINS: "",
    },
  },
});
