import { expect, test } from "@playwright/test";

test("detokenizes rendered tokens via extension", async ({ page }) => {
  test.skip(process.env.RUN_E2E !== "1", "Set RUN_E2E=1 after building extension and installing browser binaries.");

  await page.goto("http://localhost:4173");

  await expect(page.locator("body")).toContainText("James");
  await expect(page.locator("body")).not.toContainText("[[TOKEN-Name-J]]");
});
