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
    acceptDownloads: true,
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

test("renders the human test fixture surface for manual validation", async ({ baseURL }) => {
  const page = await context.newPage();

  await page.goto(`${baseURL}/human-test.html`);

  await expect(page.locator("h1")).toContainText("Plugin Detokenizer Prototype");
  await expect(page.locator("#manual-text")).toContainText("James");
  await expect(page.locator("#manual-rich")).toContainText("Daniel");
  await expect(page.locator("#manual-input")).toHaveValue("Marc");
  await expect(page.locator("#manual-placeholder")).toHaveAttribute("placeholder", "Jay");
  await expect(page.locator("#manual-textarea")).toHaveValue("Ed");
  await expect(page.locator("#manual-editable")).toContainText("James");
  await expect(page.locator("#manual-aria-button")).toHaveAttribute("aria-label", "Daniel");
  await expect(page.locator("#manual-aria-button")).toHaveAttribute("aria-description", "Marc");
  await expect(page.locator("#manual-aria-button")).toContainText("Jay");
  await expect(page.locator("#manual-attr-image")).toHaveAttribute("alt", "Daniel");
  await expect(page.locator("#manual-attr-image")).toHaveAttribute("title", "James");
  await expect(page.locator("#manual-frame")).toBeVisible();
  await expect(page.locator("#manual-async-status")).toContainText("Ed");
  await expect(page.locator("#manual-ocr-png")).toBeVisible();
  await expect(page.locator("#manual-ocr-jpg")).toBeVisible();
  await expect(page.locator("#manual-ocr-webp")).toBeVisible();
  await expect(page.locator("#manual-ocr-canvas")).toBeVisible();
  await expect(page.locator("a[download='sample.docx']")).toBeVisible();
  await expect(page.locator("a[download='sample.xlsx']")).toBeVisible();
  await expect(page.locator("a[download='sample.pptx']")).toBeVisible();
  await expect(page.locator("#manual-download-png")).toBeVisible();
  await expect(page.locator("#manual-download-jpg")).toBeVisible();
  await expect(page.locator("#manual-download-webp")).toBeVisible();

  await expect(page.locator("main")).not.toContainText("[<TOKEN-Name-");

  await expect(page.locator("#manual-shadow-host")).toContainText("Marc");
  await expect(page.locator("#manual-shadow-host")).toContainText("Ed");
  const shadowTitle = await page.locator("#manual-shadow-host").evaluate((host) => host.shadowRoot?.getElementById("shadow-title")?.getAttribute("title"));
  expect(shadowTitle).toBe("Daniel");

  const frame = page.frameLocator("#manual-frame");
  await expect(frame.locator("#iframe-text")).toContainText("Ed");
  await expect(frame.locator("#iframe-placeholder")).toHaveAttribute("placeholder", "James");

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
