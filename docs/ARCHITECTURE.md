# Architecture

## Components
- `extension`: Manifest V3 Chrome extension bundle.
- `mock-api`: Local Node/Express server that stands in for the real detokenization API during development.
- `tests/fixtures`: Manual and automated fixture pages plus downloadable artifact builders.
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
1. Content script scans text nodes, editable controls, open shadow roots, and extension-accessible frame documents, including injected cross-origin subframes where Chrome allows it.
2. Regex detections are filtered by the approved token allowlist.
3. Approved tokens are deduplicated and sent to background worker with minimal payload (`domain`, `tokens`).
4. Background worker checks in-memory cache and batches unresolved tokens to API.
5. API mappings are returned to content script and applied with text-safe replacement only.
6. Popup reads per-tab metrics, errors, and runtime state and controls per-tab toggles.
7. Unknown token-shaped values are ignored and remain unchanged.

## Visual Runtime
1. Content script finds visible supported `img` and `canvas` surfaces in the viewport.
2. Background worker captures the visible tab and forwards cropped surface descriptors to the offscreen runtime.
3. Offscreen runtime performs OCR using:
   - native `TextDetector` when available
   - bundled `tesseract.js` fallback otherwise
4. Only approved tokens detected in those OCR results are sent to the detokenization API.
5. Content script paints memory-only overlay regions over the visual surfaces.
6. Overlay state is sticky per surface so partial OCR passes do not wipe previously recognized regions immediately.

## Download Runtime
1. Supported page clicks on supported download links are intercepted only when the tab is enabled and automatic downloads are enabled.
2. If interception cannot complete, the content script replays a native browser download instead of leaving the click as a no-op.
3. Background worker creates a sensitive processing job and fetches the source bytes with extension privileges.
4. Offscreen runtime performs local extraction and OCR for supported file types:
   - `txt`, `json`
   - raster images
   - `pdf`
   - `docx`, `xlsx`, `pptx`
5. Only matched tokens are sent to the detokenization API.
6. Rewritten downloads are emitted back to the browser as detokenized files.
7. Sensitive in-memory job state is purged on tab lifecycle events and short TTL expiry.

## Human Test Gallery
The manual gallery fixture is intentionally structured as numbered exhibits:
- Section A: DOM token surfaces
- Section B: embedded/runtime surfaces
- Section C: image and canvas OCR surfaces
- Section D: supported download artifacts

The page is intended to remain tokenized at rest with the extension disabled, then detokenize when popup toggles are enabled.

## Mock API Role
- The Node server in `mock-api` is a development stand-in for the production detokenization endpoint.
- It exposes `POST /detokenize`, accepts the same high-level payload shape used by the extension (`domain`, `tokens`), and returns a `mappings` object for the tokens it knows about.
- It validates that a bearer token is present, applies basic request-shape checks, and logs request metadata without logging cleartext values.
- Its current token resolution is in-memory and seeded from shared mock mappings, so it simulates the contract of the real API without depending on a backend service or datastore.
- In production, this mock would be replaced by the real backend implementation that performs actual authorization and token-to-cleartext resolution.

## Security Controls
- No page body forwarding.
- No cleartext persistence to `storage.local`, `storage.sync`, IndexedDB, or repo-tracked files.
- On-screen detokenized overlays are memory-only and aggressively purged.
- Detokenized downloaded files are intentionally written to disk for supported file types.
- Text-only writes (`textContent` / value assignment).
- Request IDs per detokenization request.
- TLS required by default (HTTP allowed only for localhost in explicit dev mode).
- OCR worker assets are bundled into the extension for local processing.

## Performance Controls
- 75ms mutation debounce.
- Max batch size 100 tokens.
- 5-minute in-memory cache TTL.
- Incremental mutation processing only (no full rescans on every mutation).
- Scanner skips `script`, `style`, `noscript`, and `template` containers to avoid non-user-content processing.
- Visual scan backoff on capture quota and permission failures.

## Future Mapping File Integration
The approved-token catalog is intentionally isolated so the hardcoded allowlist can be replaced later by a mapping-file parser without redesigning the scan and transport pipeline.

## Scope Statement
The supported scope is "all supported content the user can see in the browser and all supported downloadable file types the extension can access." Browser-managed restricted surfaces are still out of scope, so the product should not claim universal coverage of every possible browser-visible surface.
