# chrome-detokenizer-plugin

Browser extension and local mock API for just-in-time DOM detokenization.

## Features
- Manifest V3 extension (background service worker + content script + popup UI)
- SharePoint 365 targeting (`https://*.sharepoint.com/*`) with localhost dev support
- Incremental token detection with `MutationObserver`
- Token-only API payloads (`domain`, `tokens[]`)
- Exact-match text replacement (no HTML injection)
- In-memory cache with TTL (session-only cleartext handling)
- Open shadow DOM and same-origin iframe support
- Local mock API with bearer auth-header validation

## Approved Tokens (Current Phase)
Only the following token set is sent to backend and replaced in-page:
- `[<TOKEN-Name-J>]` -> `James`
- `[<TOKEN-Name-M>]` -> `Marc`
- `[<TOKEN-Name-E>]` -> `Ed`

Unknown token-shaped strings (for example `[<TOKEN-Name-X>]`) are ignored by outbound filtering and remain unchanged in the DOM.

## SharePoint Scope
The extension auto-runs on:
- `https://*.sharepoint.com/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

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
- `npm run test`

## Local Mock Fallback
If `VITE_DETOKENIZER_API_URL` points to localhost/127.0.0.1 and the mock API is temporarily unreachable, the extension now falls back to the same local token mappings used by the mock API. This keeps detokenization working for tonight's testing while you bring the mock server back up.

## Docs
- `docs/ARCHITECTURE.md`
- `docs/SETUP.md`

## Next Integration Step
Token allowlisting is currently hardcoded for this phase. The code is structured so this can be replaced with mapping-file parsing in a later iteration.
