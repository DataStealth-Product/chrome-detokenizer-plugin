# chrome-detokenizer-plugin

Browser extension and local mock API for just-in-time detokenization of supported in-browser content and supported downloaded files.

## Features
- Manifest V3 extension (background service worker + content script + popup UI)
- Broad page support across standard web pages where Chrome permits content scripts
- Incremental token detection with `MutationObserver`
- Rich-text token detection across common inline formatting markup
- Token-only API payloads (`domain`, `tokens[]`)
- Exact-match text replacement (no HTML injection)
- In-memory cache with TTL (session-only cleartext handling)
- Visible attribute scanning for `placeholder`, `title`, `alt`, `aria-label`, `aria-description`, and `aria-placeholder`
- Open shadow DOM and cross-origin iframe content-script support where Chrome permits extension injection
- Visual-surface OCR overlays for supported `img` and `canvas` content the user can see in-page
- Automatic supported-download detokenization for `txt`, `json`, `pdf`, `docx`, `xlsx`, `pptx`, and common raster image formats
- Embedded image OCR inside supported Office Open XML files
- Local mock API with bearer auth-header validation

## Approved Tokens (Current Phase)
Only the following token set is sent to backend and replaced in-page:
- `[<TOKEN-Name-J>]` -> `James`
- `[<TOKEN-Name-M>]` -> `Marc`
- `[<TOKEN-Name-E>]` -> `Ed`
- `[<TOKEN-Name-JM>]` -> `Jay`
- `[<TOKEN-Name-D>]` -> `Daniel`

Unknown token-shaped strings (for example `[<TOKEN-Name-X>]`) are ignored by outbound filtering and remain unchanged in the DOM.

## Site Scope
The extension auto-runs on supported page URLs matched by `<all_urls>`, including regular `http://`, `https://`, and `file://` pages where Chrome allows content scripts to run.

Protected browser surfaces such as `chrome://` pages and other restricted origins remain outside extension reach.

The accurate product claim is: detokenization for all supported visible browser content and supported downloadable file types that the extension can access. It should not be described as literally all browser-visible content, because browser-managed surfaces, DRM/video, and other restricted rendering paths are still outside extension reach.

## Explicit Non-Scope
CSS-generated text such as `::before`, `::after`, and other `content:`-driven pseudo-elements is currently out of scope. The extension detokenizes DOM text/value/attribute surfaces it can safely read and rewrite, but it does not rewrite stylesheet-generated strings.

## Quick Start
```bash
npm install
npm run dev:oob
```

Then load `extension/dist` in `chrome://extensions` via **Load unpacked**.

## Config
Use `.env` values (see `.env.example`):
- `VITE_DETOKENIZER_API_URL`
- `VITE_DETOKENIZER_AUTH_TOKEN`
- `VITE_ALLOW_HTTP_DEV`

## Scripts
- `npm run dev:extension`
- `npm run build:extension`
- `npm run package:extension`
- `npm run dev:mock-api`
- `npm run dev:mock-api:watch`
- `npm run dev:oob`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test:coverage`
- `npm run test`

## Local Mock Fallback
If `VITE_DETOKENIZER_API_URL` points to localhost/127.0.0.1 and the mock API is temporarily unreachable, the extension now falls back to the same local token mappings used by the mock API. This keeps detokenization working for tonight's testing while you bring the mock server back up.

## Docs
- `docs/ARCHITECTURE.md`
- `docs/SETUP.md`

## Next Integration Step
Token allowlisting is currently hardcoded for this phase. The code is structured so this can be replaced with mapping-file parsing in a later iteration.
