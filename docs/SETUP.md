# Setup

## Prerequisites
- Node.js 20+
- npm

## Install
```bash
npm install
```

## One-Command Local Setup
```bash
npm run dev:oob
```

This starts:
- the local mock detokenization API on `127.0.0.1:8787`
- the human fixture server on `127.0.0.1:4173`

Manual test page:
- [http://127.0.0.1:4173/human-test.html](http://127.0.0.1:4173/human-test.html)

## Run Mock API
```bash
npm run dev:mock-api
```

## Run Fixture Server Only
```bash
npm run dev:fixtures
```

## Build Extension
```bash
npm run build:extension
```

Built files are generated in `extension/dist`.

If build succeeds, `extension/dist/assets/content.js` has been verified as classic-script compatible (no top-level `import`/`export`) so Chrome can execute it as a content script.

## Load in Chrome
1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select [extension/dist](/Users/jfuentes/Desktop/Chrome-Detokenizer-Plugin/chrome-detokenizer-plugin/extension/dist).
5. Reload the unpacked extension after each `npm run build:extension`.

## Popup Toggles
The popup controls runtime behavior per tab:
- `Enabled For Tab`: master switch for in-page detokenization and download interception
- `Cross-Origin Iframes`: allows processing in extension-injected cross-origin subframes where Chrome permits it
- `Visual OCR Overlays`: enables `img` and `canvas` OCR overlays
- `Automatic Downloads`: enables supported download interception and detokenized re-downloads
- `Purge Sensitive State`: clears short-lived in-memory sensitive job state

If a popup change does not seem to apply, reload the current page once after changing the toggle.

## Target Sites
The extension is scoped to supported page URLs matched by `<all_urls>`, including regular `http://`, `https://`, and `file://` pages where Chrome permits injection.

Protected browser pages such as `chrome://` still cannot be instrumented by the extension.

## Approved Tokens (Current Phase)
Only these tokens are sent and replaced:
- `[<TOKEN-Name-J>]` -> `James`
- `[<TOKEN-Name-M>]` -> `Marc`
- `[<TOKEN-Name-E>]` -> `Ed`
- `[<TOKEN-Name-JM>]` -> `Jay`
- `[<TOKEN-Name-D>]` -> `Daniel`

Unknown token-like values remain unchanged.

## Environment Variables
Copy `.env.example` to `.env` and adjust values:
- `VITE_DETOKENIZER_API_URL`
- `VITE_DETOKENIZER_AUTH_TOKEN`
- `VITE_ALLOW_HTTP_DEV`

If you see `[detokenizer] detokenize error: api_url_not_secure`, either use an `https://` API URL or set `VITE_ALLOW_HTTP_DEV=true` only for localhost/127.0.0.1 development APIs.

If localhost mock API is down (`detokenize_fetch_failed:http://127.0.0.1:8787`), the extension now fails over to built-in mock mappings so detokenization still works while you restart the mock server.

## Visual OCR Notes
Visual OCR now works in the offscreen runtime using:
- native `TextDetector` when present
- bundled `tesseract.js` fallback when native OCR is unavailable

That means stock Chrome builds that do not expose `TextDetector` can still detokenize supported image and canvas exhibits.

Operational notes:
- the first OCR pass is slower because the OCR worker and language data must initialize
- visual overlays are memory-only and short-lived
- the popup may still show the last recorded error until the next successful pass clears it

## Human Test Page Workflow
Use the manual gallery like this:
1. Open [http://127.0.0.1:4173/human-test.html](http://127.0.0.1:4173/human-test.html) with the extension disabled for the tab
2. Confirm the exhibits remain tokenized at rest
3. Enable the extension for the tab
4. Toggle `Visual OCR Overlays` on if you want image/canvas coverage
5. Toggle `Automatic Downloads` on if you want download interception coverage
6. Refresh the page and verify DOM, iframe, OCR, and download behavior

## Download Notes
- When `Enabled For Tab` is off, download links should behave natively.
- When `Enabled For Tab` and `Automatic Downloads` are both on, supported downloads are intercepted and rewritten in memory.
- If the extension-side download pipeline fails, the click falls back to the browser’s native download behavior.

## Tests
```bash
npm run test
```

E2E:
```bash
npm run test:e2e
```

The e2e suite starts its own fixture server on `4174` and mock API on `8877`.

## Future Token Mapping File
Current token allowlisting is hardcoded for this development phase and can be swapped to mapping-file ingestion in a later step.
