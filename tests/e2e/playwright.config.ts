import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(currentDir, "../..");
const fixturePort = 4174;
const mockApiPort = 8877;

export default defineConfig({
  testDir: currentDir,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${fixturePort}`,
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: `FIXTURE_PORT=${fixturePort} node ${path.resolve(currentDir, "fixture-server.mjs")}`,
      url: `http://127.0.0.1:${fixturePort}/health`,
      cwd: workspaceRoot,
      reuseExistingServer: false
    },
    {
      command: `MOCK_API_PORT=${mockApiPort} node --import tsx mock-api/src/index.ts`,
      url: `http://127.0.0.1:${mockApiPort}/health`,
      cwd: workspaceRoot,
      reuseExistingServer: false
    }
  ]
});
