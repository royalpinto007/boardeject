# Native fidelity gate

## Evidence, not a synthetic completion claim

Upstream checked on 2026-09-12: commit
`f35764612125ea8385239990ce4f3655b0f4297f` remains current. Its public fixture
directory has one named real-board pair, a mixed fixture pair, and ink-pen.drawing.
No additional real group capture or Apple-rendered spline comparison was found.
The ink fixture is useful binary parser evidence; its provenance is not sufficient
to describe it as a real user drawing.

[Apple's PencilKit explanation](https://developer.apple.com/videos/play/wwdc2020/10148/)
documents uniform cubic B-spline paths. BoardEject now samples that basis instead
of connecting raw controls. Repeated endpoint controls are an explicit
approximation, not a verified reconstruction of Apple's endpoint policy.

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
4. A pen curve with visible endpoints, a short two-point stroke and an erased stroke.
5. A labelled shape and bound arrow, a merged table cell, and an original image.

Change one property per capture. This permits differential testing of native
coordinate ownership rather than tuning code until one picture looks plausible.
For spline endpoints, record reference points from PencilKit's
`stroke.path.interpolatedPoints(by: .parametricStep(0.125))`, with the stroke
transform applied. The uniform-basis tests cannot substitute for that reference.

## Release status

No Mac or new captures are available in this environment. End-to-end native
fidelity is therefore not validated. Passing unit tests, a compiling helper,
or the synthetic demo must not clear this gate. No deployment or release occurs.
