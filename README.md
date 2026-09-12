# BoardEject

**Your board. Your format.**

Turn Apple Freeform boards into editable Excalidraw files.

Private development preview. No public release or domain deployment yet. Board data stays on your device.

## Development

Node 22.12 or newer. Run `npm ci`, then `npm run dev`. The local UI listens only on `127.0.0.1:5190`.

## Architecture

`apps/mac-helper` captures Apple's private pasteboard flavors. `packages/freeform-parser` decodes them using libfreeform's Rust/WebAssembly parser. `packages/board-model` defines a format-independent intermediate model. `packages/excalidraw-converter` produces editable elements. `apps/web` handles import, reporting and download.

No accounts, board uploads, backend, or cloud persistence. The official Excalidraw component will open exports locally, not through a sharing service. Unsupported content is reported, never silently counted as a successful conversion.

The future v0.0.1 release requires explicit owner approval, domain details and macOS validation.
