import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

// Load .env so the integration tests can read DATABASE_URL_TEST / DIRECT_URL_TEST
// locally without exporting anything in the shell.
loadEnv(process.env.NODE_ENV ?? "test", process.cwd(), "");

// Integration tests — run sequentially against a dedicated test database.
// Required env: DIRECT_URL_TEST (falls back to DIRECT_URL / DATABASE_URL).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.ts"],
    setupFiles: ["src/test/setup.ts"],
    // Sequential execution: integration tests share one database and
    // truncate tables between files.
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
