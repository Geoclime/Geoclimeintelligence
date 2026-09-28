import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Tests never touch a real database or Firebase; these only satisfy env validation.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: "postgres://test:test@localhost:5432/unused",
      FIREBASE_PROJECT_ID: "test-project",
      CORS_ORIGINS: "",
    },
  },
});
