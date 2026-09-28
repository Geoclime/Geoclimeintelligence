/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // Matches the backend's default CORS_ORIGINS (server/.env.example).
    port: 5173,
  },
  test: {
    // Unit tests cover pure logic only (envelope parsing, pagination, error mapping), so no DOM.
    // Screens are covered end to end by Cypress (standard section 21).
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
