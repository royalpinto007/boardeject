# BoardEject

**Your board. Your format.**

Turn Apple Freeform boards into editable Excalidraw files.

An editable escape route, not another whiteboard. No account, no board uploads,
no cloud storage.

![Move a shape, watch its connected arrow follow, then edit text](docs/demo.gif)

**Development preview:** this recording uses a synthetic example to demonstrate
editable output. Complete native Freeform conversion is not ready. See the
[fidelity report](docs/fidelity.md) before importing real work.

[Watch MP4](docs/demo.mp4) · [Try the sample file](examples/example.excalidraw) ·
[MIT license](LICENSE)

## Development

Requires Node 22.12 or newer.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5190 and choose **Try example board**. Open the result in
Excalidraw, move a card, and edit the text. Download to keep your changes.

## Import from Freeform

Apple Freeform → select objects → Cmd+C → capture → BoardEject → Excalidraw.

Browsers cannot reliably read Apple's private clipboard types. The tiny
[macOS helper](docs/clipboard.md) saves a `.boardeject` capture for the file picker.
The clipboard button accepts that same envelope copied as text. It does not
claim direct access to private pasteboard formats. PDF is not supported input.

No Mac was available during development. The helper compiles in macOS CI, but
actual Freeform capture remains unverified. Captures with unsupported native
versions are rejected instead of producing misleading exports.

## Architecture

`apps/mac-helper` captures Apple's private pasteboard flavors. `packages/freeform-parser` decodes them using libfreeform's Rust/WebAssembly parser. `packages/board-model` defines a format-independent intermediate model. `packages/excalidraw-converter` produces editable elements. `apps/web` handles import, reporting and download.

No accounts, board uploads, backend, or cloud persistence. The official Excalidraw component will open exports locally, not through a sharing service. Unsupported content is reported, never silently counted as a successful conversion.

## Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
# In another terminal:
python3 scripts/browser_check.py
```

Browser checks require Python Playwright and Google Chrome. They verify shape
movement, a following bound arrow, text editing, responsive layout and zero
external requests during the tested flow.

## Demo

With the preview server running, use `npm run demo`. FFmpeg and Python Playwright
are required. To regenerate existing assets:
`python3 scripts/record_demo.py --replace`.
The MP4/GIF are real browser recordings, not generated animation. They begin in
Excalidraw and demonstrate converter output, not the unverified Freeform copy step.

## Roadmap

- Complete per-element native fixtures and coordinate validation.
- Preserve native images, PencilKit strokes, tables and nested groups.
- Validate actual Freeform clipboard captures across supported macOS versions.
- Add a one-click native helper onboarding flow.
- Publish v0.0.1 after owner approval and domain setup.

The repository stays private for now. No release, package publication or domain
deployment is authorized yet.

## Contributing and credits

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
Built on [libfreeform](https://github.com/can1357/libfreeform) and
[Excalidraw](https://github.com/excalidraw/excalidraw). BoardEject is independent
of Apple and Excalidraw. Third-party code and fonts retain their original licenses.
