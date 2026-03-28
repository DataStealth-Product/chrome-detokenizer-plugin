# chrome-detokenizer-plugin

Manifest V3 browser extension plus local mock API for just-in-time detokenization of supported browser content, supported visual surfaces, and supported downloaded files.

## What It Does
- Detokenizes supported DOM text, editable fields, and selected visible attributes in-place.
- Rewrites approved tokens only. Unknown token-like strings stay untouched.
- Scans supported `img` and `canvas` surfaces and paints memory-only overlays for detected replacements.
- Intercepts supported downloads, detokenizes them in memory, and hands the rewritten file back to Chrome.
- Exposes a human test gallery page for manual verification across DOM, frames, OCR, and downloads.

## Current Surface Support
- Text nodes and common rich-text inline splits
- `input`, `textarea`, and `contenteditable`
- `placeholder`, `title`, `alt`, `aria-label`, `aria-description`, `aria-placeholder`
- Open shadow DOM
- Same-origin frames, plus extension-injected cross-origin frames where Chrome allows it
- Async DOM mutation after initial render
- Visual OCR overlays for supported `img` and `canvas`
- Supported downloads: `txt`, `json`, `png`, `jpg`, `jpeg`, `webp`, `pdf`, `docx`, `xlsx`, `pptx`
- Embedded raster images inside supported Office Open XML documents

## Approved Tokens
Only these tokens are sent to the backend and eligible for replacement:
- `[<TOKEN-Name-J>]` -> `James`
- `[<TOKEN-Name-M>]` -> `Marc`
- `[<TOKEN-Name-E>]` -> `Ed`
- `[<TOKEN-Name-JM>]` -> `Jay`
- `[<TOKEN-Name-D>]` -> `Daniel`

Unknown token-shaped strings such as `[<TOKEN-Name-X>]` are filtered out before transport and remain unchanged.

## Human Test Gallery
The manual test page is a labeled exhibit gallery designed to stay tokenized at rest with the extension off, then detokenize when the extension is enabled.

Default local URL:
- [http://127.0.0.1:4173/human-test.html](http://127.0.0.1:4173/human-test.html)

The gallery includes:
- DOM token exhibits
- Embedded token exhibits for shadow DOM, async mutation, and iframe coverage
- Image token exhibits for PNG, JPG, WEBP, and live canvas OCR
- Download token exhibits for text, Office, PDF, and raster files

## Quick Start
```bash
npm install
npm run dev:oob
```

Then:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select [extension/dist](/Users/jfuentes/Desktop/Chrome-Detokenizer-Plugin/chrome-detokenizer-plugin/extension/dist)
5. Open [http://127.0.0.1:4173/human-test.html](http://127.0.0.1:4173/human-test.html)

## Popup Controls
The popup exposes per-tab controls for:
- `Enabled For Tab`
- `Cross-Origin Iframes`
- `Visual OCR Overlays`
- `Automatic Downloads`
- `Purge Sensitive State`

The popup also shows per-tab metrics:
- tokens detected
- tokens detokenized
- error count
- average API latency
- active sensitive jobs

## Visual OCR Behavior
Visual OCR now uses a layered approach:
- native `TextDetector` when available
- bundled offscreen `tesseract.js` fallback when native OCR is unavailable

Notes:
- the first visual OCR pass can take longer while the offscreen OCR worker initializes
- visual overlays are memory-only and purged automatically
- overlays are “sticky” per surface so partial OCR passes do not cause obvious flicker

## Download Behavior
- With the extension disabled for a tab, downloads should behave like normal browser downloads.
- With the extension enabled and `Automatic Downloads` on, supported files are intercepted, detokenized in memory, and re-downloaded through Chrome.
- If extension-side interception fails, the click falls back to the browser’s native download behavior instead of becoming a no-op.

## Site Scope
The extension runs on supported page URLs matched by `<all_urls>`, including standard `http://`, `https://`, and `file://` pages where Chrome permits content script injection.

Out of scope:
- `chrome://` and other protected browser surfaces
- DRM/video and other browser-managed rendering paths
- CSS-generated pseudo-element content such as `::before` and `::after`

The accurate product claim is: detokenization for all supported visible browser content and supported downloadable file types that the extension can access.

## Configuration
Environment variables live in `.env`:
- `VITE_DETOKENIZER_API_URL`
- `VITE_DETOKENIZER_AUTH_TOKEN`
- `VITE_ALLOW_HTTP_DEV`

See [docs/SETUP.md](/Users/jfuentes/Desktop/Chrome-Detokenizer-Plugin/chrome-detokenizer-plugin/docs/SETUP.md) for details.

## Scripts
- `npm run dev:extension`
- `npm run build:extension`
- `npm run package:extension`
- `npm run dev:mock-api`
- `npm run dev:mock-api:watch`
- `npm run dev:fixtures`
- `npm run dev:oob`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test:coverage`
- `npm run test`

## Local Mock Fallback
If `VITE_DETOKENIZER_API_URL` points to `localhost` or `127.0.0.1` and the mock API is unavailable, the extension falls back to the same local mappings used by the mock API so development detokenization still works.

## Docs
- [docs/SETUP.md](/Users/jfuentes/Desktop/Chrome-Detokenizer-Plugin/chrome-detokenizer-plugin/docs/SETUP.md)
- [docs/ARCHITECTURE.md](/Users/jfuentes/Desktop/Chrome-Detokenizer-Plugin/chrome-detokenizer-plugin/docs/ARCHITECTURE.md)

## Next Integration Step
The token allowlist is intentionally isolated for this phase so it can later be replaced with mapping-file ingestion without redesigning the scan and transport pipeline.
