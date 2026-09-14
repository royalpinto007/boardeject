# Hosted Freeform capture experiment

Run **Freeform UI capture experiment** manually in Actions. It has read-only
repository permissions, no credentials, an eight-minute timeout and seven-day
artifact retention. It does not modify the parser, release, deploy, or promote
fixtures. All output goes to `RUNNER_TEMP`, never the repository.

## Observed results

- [Permission probe](https://github.com/royalpinto007/boardeject/actions/runs/34717080150):
  macOS 26.6.2, Freeform 4.5, interactive `runner` console session. Freeform
  launched successfully. `AXIsProcessTrusted` and keyboard event preflight both
  returned true. System Events menu enumeration and keyboard events succeeded.
  No TCC bypass, permission database modification, or account login was used.
- [First editing attempt](https://github.com/royalpinto007/boardeject/actions/runs/34717181902):
  menu commands returned success but the welcome screen remained visible and
  every pasteboard was empty. This is not a successful capture.
- [Welcome-screen handling](https://github.com/royalpinto007/boardeject/actions/runs/34717282427):
  the observed Continue button was clicked and real native Freeform payloads
  were obtained for text-box, table, and nested-group attempts.
- [Paced editing and corrected handles](https://github.com/royalpinto007/boardeject/actions/runs/34737707578):
  the text payload contains `BoardEject native text 123` and a `Helvetica-Bold`
  font descriptor. The connection-line payload has head and tail object-ID
  anchors. Nested groups have separate translated, scaled, and rotated captures:
  group scale changes from 1 to approximately 0.8, child sizes from 150 to 120,
  and the final angle is approximately 315.40924 degrees. The final screenshot
  visibly agrees with rotation. The earlier handle attempt moved rather than
  resized the group and must not be treated as a scaling fixture.
- [Earlier table experiment](https://github.com/royalpinto007/boardeject/actions/runs/34737925697):
  all tools compiled and raw captures were uploaded. Table text editing works,
  but the intended separate cells were **not** achieved: the plain-text flavor
  reads `Cell Cell B1` in one cell rather than `Cell A1` and `Cell B1` in separate
  cells. The previous run put both strings and a literal tab in the first cell.
  Neither is a valid known-cell-values fixture. Further work needs reliable cell
  focus/geometry discovery, not relaxed assertions or renamed expected values.
- [Verified table differentials](https://github.com/royalpinto007/boardeject/actions/runs/34739566232):
  full-window geometry corrected cell targeting. The baseline has A1/B1/A2/B2
  in the intended four cells. Four independent mutations and their restores
  verify text ordering and unchanged RTF table structure. Minimal raw CRL, RTF
  and text are now permanent [regression fixtures](../tests/fixtures/freeform-4.5/tables/README.md).
  Native CRL geometry remains unmapped; production support is unchanged.
- [Actual Shapes picker](https://github.com/royalpinto007/boardeject/actions/runs/34749332423):
  the picker visibly includes Draw with Pen. This control was absent from the
  earlier menu-only inventory. Its name does not establish PencilKit support.
- [Failed pen activation](https://github.com/royalpinto007/boardeject/actions/runs/34749473688):
  the picker stayed open after the System Events click. Subsequent drags selected
  a stock pentagon. No `com.apple.drawing` was copied. This is an automation
  failure, not evidence that a correctly activated pen cannot create ink.
- [Native mouse activation](https://github.com/royalpinto007/boardeject/actions/runs/34749559107):
  actual CGEvent clicking activated Draw with Pen. Its visible help describes
  straight/curved points and midpoint editing. Three native mouse drags produced
  three `com.apple.apps.content-language.shape` objects containing
  `com.apple.apps.content-language.path.bezier-path` and line strokes.
  All advertised clipboard flavors were dumped and their hashes checked. None
  was `com.apple.drawing`. The menu, toolbar and window inventories completed
  successfully but exposed no eraser. This is vector shape editing, not a
  verified PencilKit drawing/erasing surface. These experimental outputs remain
  outside permanent fixtures. No before/after ink-erasure claim is possible
  from this run; Apple Pencil pressure remains explicitly unverified.
- [Dedicated Issue #13 rerun](https://github.com/royalpinto007/boardeject/actions/runs/34815085421):
  a genuine Freeform 4.5 copy again contained native CRL data, but its TSU class
  was `CRLWPShapeItem`. It contained no `com.apple.drawing`, no
  `CRLFreehandDrawingItem`, and the complete menu/toolbar accessibility
  inventories exposed no eraser. The sanitized summary is regression-tested.

The observed pen behavior agrees with [Apple's Mac shape guide](https://support.apple.com/en-gb/guide/freeform/frfm8479c716/mac).
No permission bypass or imported PKDrawing was used in these differential runs.
The macOS route is exhausted at this platform boundary. A genuine
iPad-originated Apple Pencil capture is needed for pressure and erasure testing;
track it in [issue #20](https://github.com/royalpinto007/boardeject/issues/20).

## What the artifacts prove, and what they do not

The dump uses `NSPasteboard` directly, records every advertised type (including
assets and render fallbacks), preserves raw bytes with SHA-256 hashes, and checks
the pasteboard change count. Before each attempt the disposable runner clipboard
is cleared. Screenshots and exact command output accompany each attempt.

Successful commands are **not** proof of intended content. Inspect the payload
and screenshot together. Initial text entry was empty until focus delays were
added; later table differentials now meet the intended values. The observed group and connector
records are useful native evidence, not yet proof of our parser's interpretation
or round-trip conversion. No pen/eraser creation command was observed in the
macOS Insert menu. Variable-width and erased ink are not captured. Apple's
[Mac table guide](https://support.apple.com/en-ie/guide/freeform/frfm88aa30f3/mac)
documents double-clicking a cell to enter text; the experiment attempts that
using native mouse events, without injecting clipboard content.

The welcome-screen coordinate is specific to the observed hosted-runner display.
Inspect screenshots after every run; a UI change can invalidate the recipe.
The workflow's green status means the diagnostic procedure completed, not that
the fidelity cases passed. Each manifest explicitly says `verifiedFixture: false`.

No unverified experimental binary or screenshot is committed. Download artifacts before
expiry for inspection, but do not promote them to the permanent fixture set until
both native origin and intended object semantics are independently verified.
Do not remove the existing release gate on the strength of this experiment.
