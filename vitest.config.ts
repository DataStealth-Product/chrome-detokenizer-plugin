import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environmentMatchGlobs: [
      ["tests/integration/**", "jsdom"],
      ["tests/unit/**", "node"]
    ],
    globals: true,
    setupFiles: ["tests/setup.ts"],
    coverage: {
      enabled: false
    }
  }
});
