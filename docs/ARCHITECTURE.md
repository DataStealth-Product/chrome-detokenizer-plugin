# Architecture

## Components
- `extension`: Manifest V3 Chrome extension bundle.
- `mock-api`: Local Node/Express server that stands in for the real detokenization API during development.
- `tests`: Unit, integration, and e2e test suites.

## Page Scope
- Content script matches use `<all_urls>` so the scanner can run on standard `http://`, `https://`, and `file://` pages where Chrome allows content scripts.
- Restricted browser-managed surfaces such as `chrome://` remain inaccessible.

## Approved Token Set (Current Phase)
- `[<TOKEN-Name-J>]` -> `James`
- `[<TOKEN-Name-M>]` -> `Marc`
- `[<TOKEN-Name-E>]` -> `Ed`
- `[<TOKEN-Name-JM>]` -> `Jay`
- `[<TOKEN-Name-D>]` -> `Daniel`

## Extension Runtime
1. Content script scans text nodes, editable controls, open shadow roots, and same-origin iframe documents.
2. Regex detections are filtered by the approved token allowlist.
3. Approved tokens are deduplicated and sent to background worker with minimal payload (`domain`, `tokens`).
4. Background worker checks in-memory cache and batches unresolved tokens to API.
5. API mappings are returned to content script and applied with text-safe replacement only.
6. Popup reads per-tab metrics and controls enabled/disabled state.
7. Unknown token-shaped values are ignored and remain unchanged.

## Mock API Role
- The Node server in `mock-api` is a development stand-in for the production detokenization endpoint.
- It exposes `POST /detokenize`, accepts the same high-level payload shape used by the extension (`domain`, `tokens`), and returns a `mappings` object for the tokens it knows about.
- It validates that a bearer token is present, applies basic request-shape checks, and logs request metadata without logging cleartext values.
- Its current token resolution is in-memory and seeded from shared mock mappings, so it simulates the contract of the real API without depending on a backend service or datastore.
- In production, this mock would be replaced by the real backend implementation that performs actual authorization and token-to-cleartext resolution.

## Security Controls
- No page body forwarding.
- No cleartext persistence to disk/local storage.
- Text-only writes (`textContent` / value assignment).
- Request IDs per detokenization request.
- TLS required by default (HTTP allowed only for localhost in explicit dev mode).

## Performance Controls
- 75ms mutation debounce.
- Max batch size 100 tokens.
- 5-minute in-memory cache TTL.
- Incremental mutation processing only (no full rescans on every mutation).
- Scanner skips `script`, `style`, `noscript`, and `template` containers to avoid non-user-content processing.

## Future Mapping File Integration
The approved-token catalog is intentionally isolated so the hardcoded allowlist can be replaced later by a mapping-file parser without redesigning the scan and transport pipeline.
