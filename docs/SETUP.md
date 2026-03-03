# Setup

## Prerequisites
- Node.js 20+
- npm

## Install
```bash
npm install
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
