# Architecture

## Components
- `extension`: Manifest V3 Chrome extension bundle.
- `mock-api`: Local detokenization API used during development.
- `tests`: Unit, integration, and e2e test suites.

## SharePoint Scope
- Host permissions and content script matches are limited to:
  - `https://*.sharepoint.com/*`
  - `http://localhost/*`
  - `http://127.0.0.1/*`

## Approved Token Set (Current Phase)
- `[[TOKEN-Name-J]]` -> `James`
- `[[TOKEN-Name-M]]` -> `Marc`
- `[[TOKEN-Name-E]]` -> `Ed`

## Extension Runtime
1. Content script scans text nodes, editable controls, open shadow roots, and same-origin iframe documents.
2. Regex detections are filtered by the approved token allowlist.
3. Approved tokens are deduplicated and sent to background worker with minimal payload (`domain`, `tokens`).
3. Background worker checks in-memory cache and batches unresolved tokens to API.
4. API mappings are returned to content script and applied with text-safe replacement only.
5. Popup reads per-tab metrics and controls enabled/disabled state.
6. Unknown token-shaped values are ignored and remain unchanged.

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
