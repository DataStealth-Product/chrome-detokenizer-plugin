import { expect, test, chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(currentDir, "../../extension/dist");

let context: BrowserContext;
let userDataDir = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`extension_dist_missing:${extensionPath}`);
  }

  userDataDir = await mkdtemp(path.join(os.tmpdir(), "detokenizer-e2e-"));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  if (context.serviceWorkers().length === 0) {
    await context.waitForEvent("serviceworker");
  }
});

test.afterAll(async () => {
  await context.close();
  if (userDataDir) {
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("detokenizes the local fixture page through the packed extension", async ({ baseURL }) => {
  const page = await context.newPage();

  await page.goto(`${baseURL}/token-page.html`);

  await expect(page.locator("body")).toContainText("James");
  await expect(page.locator("body")).toContainText("Marc");
  await expect(page.locator("body")).toContainText("Ed");
  await expect(page.locator("body")).not.toContainText("[<TOKEN-Name-J>]");
  await expect(page.locator("body")).not.toContainText("[<TOKEN-Name-M>]");
  await expect(page.locator("body")).not.toContainText("[<TOKEN-Name-E>]");
  await expect(page.locator("body")).toContainText("[<TOKEN-Name-X>]");
  await expect(page.locator("#value-token")).toHaveValue("James Marc");
  await expect(page.locator("#placeholder-token")).toHaveAttribute("placeholder", "Lookup Jay");
  await expect(page.locator("textarea")).toHaveValue("Ed [<TOKEN-Name-X>]");
  await expect(page.locator("[contenteditable='true']")).toContainText("Marc [<TOKEN-Name-X>]");
  await expect(page.locator("#rich-token")).toContainText("Daniel");
  await expect(page.locator("#profile-image")).toHaveAttribute("alt", "Profile Daniel");
  await expect(page.locator("#profile-image")).toHaveAttribute("title", "Lead James");
  await expect(page.locator("#same-origin-frame")).toBeVisible();
  await expect(page.locator("body")).toContainText("Async token: Ed");

  await expect(page.locator("#shadow-host")).toContainText("Shadow Marc");
  await expect(page.locator("#shadow-host")).toContainText("ready");
  const shadowTitle = await page.locator("#shadow-host").evaluate((host) => host.shadowRoot?.getElementById("shadow-title")?.getAttribute("title"));
  expect(shadowTitle).toBe("Shadow title Ed");

  const frame = page.frameLocator("#same-origin-frame");
  await expect(frame.locator("#iframe-text")).toContainText("Iframe Ed");
  await expect(frame.locator("#iframe-placeholder")).toHaveAttribute("placeholder", "Frame James");

  await page.close();
});

test("detokenizes content on an opt-in public origin", async () => {
  test.skip(process.env.RUN_PUBLIC_E2E !== "1", "Set RUN_PUBLIC_E2E=1 to exercise a public site origin.");

  const page = await context.newPage();
  const publicUrl = process.env.E2E_EXTERNAL_URL ?? "https://www.onlinewordpad.com/";

  await page.goto(publicUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const host = document.createElement("section");
    host.id = "detokenizer-public-probe";
    const text = document.createElement("div");
    text.textContent = "[<TOKEN-Name-J>] [<TOKEN-Name-X>]";

    const textarea = document.createElement("textarea");
    textarea.value = "[<TOKEN-Name-M>]";

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.textContent = "[<TOKEN-Name-E>]";

    host.append(text, textarea, editable);
    document.body.append(host);
  });

  await expect(page.locator("#detokenizer-public-probe")).toContainText("James");
  await expect(page.locator("#detokenizer-public-probe")).toContainText("[<TOKEN-Name-X>]");
  await expect(page.locator("#detokenizer-public-probe textarea")).toHaveValue("Marc");
  await expect(page.locator("#detokenizer-public-probe [contenteditable='true']")).toContainText("Ed");

  await page.close();
});
