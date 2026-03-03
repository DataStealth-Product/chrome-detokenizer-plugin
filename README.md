# chrome-detokenizer-plugin

Browser extension and local mock API for just-in-time DOM detokenization.

## Features
- Manifest V3 extension (background service worker + content script + popup UI)
- Incremental token detection with `MutationObserver`
- Token-only API payloads (`domain`, `tokens[]`)
- Exact-match text replacement (no HTML injection)
- In-memory cache with TTL (session-only cleartext handling)
- Open shadow DOM and same-origin iframe support
- Local mock API with bearer auth-header validation

## Quick Start
```bash
npm install
npm run dev:mock-api
npm run build:extension
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
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:e2e`
- `npm run test`

## Docs
- `docs/ARCHITECTURE.md`
- `docs/SETUP.md`
