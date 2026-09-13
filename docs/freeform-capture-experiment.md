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
- [Latest complete experiment](https://github.com/royalpinto007/boardeject/actions/runs/34737925697):
  all tools compiled and raw captures were uploaded. Table text editing works,
  but the intended separate cells were **not** achieved: the plain-text flavor
  reads `Cell Cell B1` in one cell rather than `Cell A1` and `Cell B1` in separate
  cells. The previous run put both strings and a literal tab in the first cell.
  Neither is a valid known-cell-values fixture. Further work needs reliable cell
  focus/geometry discovery, not relaxed assertions or renamed expected values.

## What the artifacts prove, and what they do not

The dump uses `NSPasteboard` directly, records every advertised type (including
assets and render fallbacks), preserves raw bytes with SHA-256 hashes, and checks
the pasteboard change count. Before each attempt the disposable runner clipboard
is cleared. Screenshots and exact command output accompany each attempt.

Successful commands are **not** proof of intended content. Inspect the payload
and screenshot together. Initial text entry was empty until focus delays were
added; intended table cell values remain unmet. The observed group and connector
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

No experimental binary or screenshot is committed. Download artifacts before
expiry for inspection, but do not promote them to the permanent fixture set until
both native origin and intended object semantics are independently verified.
Do not remove the existing release gate on the strength of this experiment.
