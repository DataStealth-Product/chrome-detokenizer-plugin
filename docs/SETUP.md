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
