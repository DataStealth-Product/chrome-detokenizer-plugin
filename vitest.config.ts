import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    environmentMatchGlobs: [
      ["tests/integration/**", "jsdom"],
      ["tests/unit/**", "node"]
    ],
    globals: true,
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      all: true,
      include: [
        "extension/src/background/**/*.ts",
        "extension/src/content/**/*.ts",
        "extension/src/popup/**/*.ts",
        "extension/src/shared/**/*.ts",
        "mock-api/src/dataSource.ts",
        "shared/mockMappings.ts"
      ],
      exclude: [
        "extension/src/vite-env.d.ts"
      ]
    }
  }
});
