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

## Run Mock API
```bash
npm run dev:mock-api
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
4. Select `extension/dist`.

## Target Sites
The extension is scoped to:
- `https://*.sharepoint.com/*`
- `http://localhost/*`
- `http://127.0.0.1/*`

## Approved Tokens (Current Phase)
Only these tokens are sent and replaced:
- `[<TOKEN-Name-J>]` -> `James`
- `[<TOKEN-Name-M>]` -> `Marc`
- `[<TOKEN-Name-E>]` -> `Ed`

Unknown token-like values remain unchanged.

## Environment Variables
Copy `.env.example` to `.env` and adjust values:
- `VITE_DETOKENIZER_API_URL`
- `VITE_DETOKENIZER_AUTH_TOKEN`
- `VITE_ALLOW_HTTP_DEV`

If you see `[detokenizer] detokenize error: api_url_not_secure`, either use an `https://` API URL or set `VITE_ALLOW_HTTP_DEV=true` only for localhost/127.0.0.1 development APIs.

If localhost mock API is down (`detokenize_fetch_failed:http://127.0.0.1:8787`), the extension now fails over to built-in mock mappings so detokenization still works while you restart the mock server.

## Tests
```bash
npm run test
```

Optional e2e (requires browser setup + fixture server + loaded extension context):
```bash
RUN_E2E=1 npm run test:e2e
```

## Future Token Mapping File
Current token allowlisting is hardcoded for this development phase and can be swapped to mapping-file ingestion in a later step.
