import path from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: path.resolve(__dirname),
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true,
    trace: "retain-on-failure"
  }
});
