# Native fidelity gate

## Evidence, not a synthetic completion claim

Upstream checked on 2026-09-12: commit
`f35764612125ea8385239990ce4f3655b0f4297f` remains current. Its public fixture
directory has one named real-board pair, a mixed fixture pair, and ink-pen.drawing.
No additional real group capture or Apple-rendered spline comparison was found.
The ink fixture is useful binary parser evidence; its provenance is not sufficient
to describe it as a real user drawing.

[Apple's PencilKit explanation](https://developer.apple.com/videos/play/wwdc2020/10148/)
documents uniform cubic B-spline paths. Comparison with the Apple framework
artifact from Actions run 34703744158 exposed extra endpoint spans in our
sampler. It now uses linearly extrapolated endpoint controls and matches all
25 native reference positions within 0.0001 points. The checked-in reference
and regression test validate this four-control centerline case, not all ink.

[Upstream format notes](https://github.com/can1357/libfreeform/blob/main/docs/FORMAT.md)
mark native group semantics inferred. BoardEject validates nesting, identities,
cycles and ownership, and preserves identity-transform groups. It rejects
nonidentity group/counter transforms instead of guessing their composition.

## Captures required to remove the gate

Use the helper in docs/clipboard.md with a new, non-sensitive board. Include the
macOS and Freeform version and an exported PNG for visual comparison. Never send
personal board content.

1. Two shapes, separately copied, then grouped without moving them.
2. That same group translated, then rotated, each as a separate capture.
3. A group nested inside another group, with one independently moved child.
4. On iPad, an Apple Pencil curve with visible pressure variation, then the same
   curve with a bounded middle section erased.
5. A labelled shape and bound arrow, a merged table cell, and an original image.

Change one property per capture. This permits differential testing of native
coordinate ownership rather than tuning code until one picture looks plausible.
For spline endpoints, record reference points from PencilKit's
`stroke.path.interpolatedPoints(by: .parametricStep(0.125))`, with the stroke
transform applied. The uniform-basis tests cannot substitute for that reference.

## Current release boundary

GitHub's macOS runner provides usable Apple framework reference data and genuine
Freeform 4.5 captures even without a personal Mac. This validates only the
fixture-backed subsets in the README support matrix. It does not establish
general Freeform 4.5 or cross-version compatibility, and the synthetic demo is
proof of editability rather than native import fidelity.

The [hosted Freeform UI experiment](freeform-capture-experiment.md) subsequently
confirmed GUI automation is permitted and obtained experimental native payloads.
Confirmed minimal text, connector and group captures have been promoted with
provenance in `tests/fixtures/freeform-4.5/`. Table differentials additionally
verify native row-major text and stable RTF structure; see
[table evidence](../tests/fixtures/freeform-4.5/tables/README.md).
Native table behavior is covered by the supported subset. Freeform 4.5 on
macOS emits Draw with Pen output as vector shapes and exposes no eraser in the
tested flow. Apple Pencil pressure and erased ink require iPad-originated
captures and remain unverified in [issue #20](https://github.com/royalpinto007/boardeject/issues/20).
The production unsupported-version gate is unchanged. v0.0.2 is an early,
limited-scope release with these boundaries, not a claim of complete native
fidelity.
