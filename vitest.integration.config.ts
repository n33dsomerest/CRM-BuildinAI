import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests — run sequentially against the test database (crmglm_test).
// Requires DATABASE_URL / DIRECT_URL pointing at a Postgres with the schema applied.
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
