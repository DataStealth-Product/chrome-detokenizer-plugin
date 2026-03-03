import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const bundlePath = path.resolve(process.cwd(), "extension/dist/assets/content.js");

const STATIC_IMPORT_PATTERN = /(^|[;\n\r])\s*import\s+(?:["'{*\w])/;
const EXPORT_PATTERN = /(^|[;\n\r])\s*export\s+(?:\{|\*|default|const|let|var|function|class)/;

async function main() {
  try {
    await access(bundlePath);
  } catch {
    console.error(`[verify-content-bundle] Missing content bundle: ${bundlePath}`);
    process.exitCode = 1;
    return;
  }

  const source = await readFile(bundlePath, "utf8");
  const hasModuleSyntax = STATIC_IMPORT_PATTERN.test(source) || EXPORT_PATTERN.test(source);

  if (hasModuleSyntax) {
    console.error(`[verify-content-bundle] ES module syntax detected in ${bundlePath}.`);
    console.error(
      "[verify-content-bundle] Content scripts are loaded as classic scripts in this extension; module syntax will crash at runtime."
    );
    console.error("[verify-content-bundle] Ensure extension/vite.content.config.ts outputs a single-file classic bundle.");
    process.exitCode = 1;
    return;
  }

  console.log(`[verify-content-bundle] OK: ${bundlePath}`);
}

void main();
