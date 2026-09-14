# BoardEject

**Your board. Your format.**

[Try BoardEject](https://boardeject.dev) · [Help with open issues](https://github.com/royalpinto007/boardeject/issues)

[Buy me a coffee](https://www.buymeacoffee.com/royalpinto007)

Turn Apple Freeform boards into editable Excalidraw files.

An editable escape route, not another whiteboard. No account, no board uploads,
no cloud storage.

![Move a shape, watch its connected arrow follow, then edit text](docs/demo.gif)

**v0.0.2 remains an early, limited-scope release:** this recording uses a
synthetic example to demonstrate editable output, not a complete Freeform
import. Freeform 4.5 version-7 data is not generally supported. Only the
fixture-backed table and single-object sidecar fallbacks described below are
recovered. See the support matrix and [fidelity report](docs/fidelity.md) before
importing real work.

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
The **Import copied BoardEject capture** button accepts that same envelope copied
as text. It does not claim direct access to private pasteboard formats. PDF is
not supported input.

The helper compiles and passes its command-line smoke check in clean macOS CI.
Real Freeform 4.5 GUI captures on hosted macOS validate the listed conversion
subsets, not every Freeform object or version. Unsupported structures are
withheld instead of producing misleading exports.

## Test your own capture

Open [Experimental Capture Tester](https://boardeject.dev/test-capture) and
choose/drop a `.boardeject` capture (or its JSON envelope). Single `.crlnative`
and `.drawing` payloads are also accepted, but lack companion assets. Processing
stays in your browser. Review detected/converted counts and diagnostics, preview
recovered output and download `.excalidraw`. Unsupported or malformed captures
do not get substituted with an example. Normal import remains unchanged.

Run `python3 scripts/capture_browser_check.py` against the preview server to
exercise file selection, drop, failed input, preview and download. Set
`BOARDEJECT_TEST_URL` to check a deployed site with the same public test fixtures.

## Support matrix

**Table update:** verified native layouts now preserve unequal dimensions,
structure changes, ordering, text styles/alignment, solid colors, border
properties, multiple tables, and attached text boxes as editable output. Merge
and rotation are unavailable for tables in the tested Freeform version. See
[mapping evidence](docs/native-table-mapping.md).

Native capture evidence and working end-to-end conversion are different things.
Keep your original board and inspect the conversion report.

### Native image and rich-text boundary

| Native capture                  | Tested output and limits                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Image with verified mask/shadow | Original PNG resource and Bézier mask preserved in an embedded SVG image. Downward shadow offset/color/opacity retained; blur is approximate. Effects are part of the image asset, not editable effect controls. Other crop/transform variants remain unsupported. |
| Plain/bold/mixed text           | One editable text element with decoded first-run size/alignment. Original run boundaries, font names, bold/italic and sizes remain in metadata. Mixed styling and exact fonts are not visually preserved; wrapping, padding and color use defaults.                |

These paths require the complete capture sidecars, not standalone CRL. They do
not enable arbitrary version-7 boards. [Issue #14](https://github.com/royalpinto007/boardeject/issues/14)
records the completed implementation and destination-format limits.

| Capability                           | v0.0.2 evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editable Excalidraw output           | Browser-tested shape movement, following bound arrows and text editing; demo input is synthetic.                                                                                                                                                                                                                                                                                                                                                                                                |
| Shapes and text                      | Explicit preset mapping and recovered plain text on supported decoded inputs. Verified single-object plain, mixed and multiline native text remains editable with first-run size/alignment. Native run boundaries, font names, sizes, bold and italic descriptors are retained in metadata. Excalidraw cannot visually render mixed weight/italic runs. [#9](https://github.com/royalpinto007/boardeject/issues/9), [#14](https://github.com/royalpinto007/boardeject/issues/14).               |
| Connectors                           | Reciprocal output bindings tested. Real captures contain matching object-ID anchors; those version-7 boards remain rejected. [#9](https://github.com/royalpinto007/boardeject/issues/9).                                                                                                                                                                                                                                                                                                        |
| Groups/transforms                    | Identity-transform membership tested. Real nested scale/rotation captures exist; nonidentity native transform conversion is not supported. [#8](https://github.com/royalpinto007/boardeject/issues/8).                                                                                                                                                                                                                                                                                          |
| Splines and ink                      | Centerline spline endpoints match 25 Apple PencilKit reference samples. Supported decoded ink produces freedraw output. Genuine Freeform 4.5 macOS evidence identifies Draw with Pen output as `CRLWPShapeItem` vector shapes, with no `com.apple.drawing` or `CRLFreehandDrawingItem`.                                                                                                                                                                                                         |
| Width/force decoding and mask safety | Apple-generated width/force data decoding has regression coverage. The tested geometric mask is detected and the stroke omitted with a report, rather than incorrectly restoring hidden ink. Output remains a uniform-width approximation.                                                                                                                                                                                                                                                      |
| Pressure-sensitive / erased ink      | **iPad-originated Apple Pencil pressure and erased-ink round trips remain unverified.** Freeform 4.5 on macOS exposes neither PencilKit ink output nor an eraser in the tested flow. Apple framework fixtures validate decoding, not a Freeform round trip. Follow [#20](https://github.com/royalpinto007/boardeject/issues/20).                                                                                                                                                                |
| Images/assets                        | Verified single-object native PNG resources retain original pixels and the captured Bézier mask in an editable/movable SVG image asset. Captured shadow offset/color/opacity are retained; blur is calibrated but approximate. Effects are not independent Excalidraw controls. Other resources, crops/transforms and shadow variants remain unsupported. [#14](https://github.com/royalpinto007/boardeject/issues/14).                                                                         |
| Tables                               | **Verified subset:** editable cell IDs/text, unequal dimensions, insert/delete/reorder, multiline/empty content, font metadata/alignment, solid text/background colors, border visibility/width/color/solid-or-dotted style, multiple tables, and attached text boxes. Outer-only edges and attachment padding are approximated. Freeform 4.5 exposes no table merge or rotation operation; other attachment classes fail safely. [#15](https://github.com/royalpinto007/boardeject/issues/15). |
| Reporting and privacy                | Unsupported elements/versions reported; no fabricated replacement output. Browser processing, no accounts, board uploads or cloud storage.                                                                                                                                                                                                                                                                                                                                                      |
| Freeform version compatibility       | Compatible native versions reported by libfreeform use the normal adapter. Genuine Freeform 4.5 captures declare minimum version 7, which is not generally supported. Only verified table and single-object image/text sidecar fallbacks are recovered; other version-7 structures are withheld. Cross-version validation remains [#6](https://github.com/royalpinto007/boardeject/issues/6).                                                                                                   |

See [fidelity details](docs/fidelity.md), [native evidence](docs/freeform-capture-experiment.md),
[privacy](https://boardeject.dev/privacy) and [terms](https://boardeject.dev/terms).

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

- Add fixture-backed native conversion for labelled shapes, connectors and
  nonidentity group transforms.
- Validate Freeform clipboard captures across additional macOS versions.
- Validate iPad-originated Apple Pencil pressure and erasure in
  [#20](https://github.com/royalpinto007/boardeject/issues/20).
- Add a one-click native helper onboarding flow.

v0.0.2 freezes the verified scope above, not the remaining fidelity work.
Contributions and non-sensitive native test captures are welcome.

## Contributing and credits

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
Built on [libfreeform](https://github.com/can1357/libfreeform) and
[Excalidraw](https://github.com/excalidraw/excalidraw). BoardEject is independent
of Apple and Excalidraw. Third-party code and fonts retain their original licenses.
