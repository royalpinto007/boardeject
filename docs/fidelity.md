# Fidelity and evidence

BoardEject v0.0.1 is an early limited-scope release. The README support matrix
distinguishes native evidence from tested converter behavior.

## What has actually been tested

- libfreeform 1.0.0 decodes the upstream binary regression fixtures.
- Invalid envelopes and duplicate clipboard types are rejected.
- Unknown/unsupported native versions do not produce fabricated output.
- The converter produces individual text, shape and freedraw objects.
- Synthetic arrows have reciprocal Excalidraw element bindings.
- Synthetic grouped objects retain group identifiers.
- Nested identity-transform native group graphs preserve membership and reject cycles.
- Binary ink controls are decoded and sampled into editable freedraw elements.
- Valid drawing data survives an independently unsupported native board version.

## Important native parser limitations

### Verified single-object image and text fallback

The content-language sidecar in the new native fixtures now supports a narrow
single-object fallback alongside CRL. This is not general version-7 support.
It requires the full capture envelope, including the image resource flavor;
a standalone CRL file does not contain that resource.

Images preserve the original resource pixels and the captured absolute Bézier
mask in an embedded SVG image. The verified downward shadow retains its offset,
color and opacity. Mapping the native radius to SVG Gaussian blur is an explicit
approximation, not a pixel-identical shadow claim. Effects become part of the
movable/resizable image asset, not independent Excalidraw controls. Other crop
types, mask transforms, shadow directions and missing resources are withheld.

Native mixed text becomes one editable Excalidraw text element, not an image.
The first run supplies font size and paragraph alignment. Original run boundaries,
font names, sizes, bold and italic descriptors are retained in `customData`.
Excalidraw does not render mixed bold/italic runs, so these descriptors are
metadata, not visible style support. Font family is substituted with its sans-serif
font; color, padding and wrapping use defaults. This keeps editing coherent
without guessing per-run glyph widths. Every fallback reports these losses.

Tests cover genuine baseline/moved images and plain/bold/mixed text, invalid
archives and unsafe paths, plus browser file upload, image-mask pixels and preview.
[Issue #14](https://github.com/royalpinto007/boardeject/issues/14) remains open for
broader native fidelity. No full rich-text or image-effects support is claimed.

### Ink decoding and mask safety

Apple-generated width/force data has regression coverage. The paired native
PencilKit fixtures expose a geometric mask that libfreeform does not return as
visible ranges. BoardEject now detects this mask and omits the stroke with an
unsupported report instead of restoring its hidden regions. This is conservative
omission, not editable eraser reconstruction. Unmasked output remains a
uniform-width approximation.

Genuine Freeform eraser and pressure-sensitive round-trip captures remain
unverified. [Issue #13](https://github.com/royalpinto007/boardeject/issues/13)
stays open. See the [Apple reference provenance](../tests/fixtures/apple/README.md).

The upstream `native-mixed` fixture exposes three identities but no geometry.
The upstream `real-board` capture declares minimum version 7, which the decoder
marks unsupported. Its decoded data lacks several text bodies, connector
relationships, table cell data and image bytes. BoardEject withholds export of
this capture. It does not infer omitted text or turn unknown presets into
rectangles.

The native adapter currently accepts only explicit supported versions, bounded
canvas-space geometry, a small explicit shape-preset mapping, recovered plain
text, and connectors with recovered endpoints. These adapter paths still need
per-element native fixtures and real-device validation. They are not a support
promise.

## Not yet implemented or validated

Adapter tests now cover embedded PNG/JPEG data, affine-transformed rendered ink
samples, and complete axis-aligned table grids with merged cells. These tests
use explicit decoded model inputs, not captured native records. They must not
be represented as proof of end-to-end Freeform support.

- Nonidentity native group transforms (membership is implemented)
- PencilKit masks and variable-width strokes (centerline endpoint sampling now matches a checked-in Apple framework reference; broader stroke cases remain unvalidated)
- Native embedded image extraction and safe format conversion
- Editable native tables and merged cells
- Rich text runs, font matching, path shapes and routing
- Full affine, flipped and nested geometry
- End-to-end conversion of current version-7 Freeform boards

Real Freeform GUI copy now has confirmed captures. Native table differential
fixtures now prove cell-ID ordering, dimensions and translation for the single-table
recovery path. Styling uses defaults. Other version-7 layouts remain rejected.
Track [tables](https://github.com/royalpinto007/boardeject/issues/12),
[erased/pressure ink](https://github.com/royalpinto007/boardeject/issues/13) and
[native assets/rich text](https://github.com/royalpinto007/boardeject/issues/14).

The example board is synthetic. It is a converter demonstration, not a captured
Apple Freeform board. No simulated Freeform UI or copy footage should be used in
the demo.

See [native-validation.md](native-validation.md) for the source evidence and
the exact real captures needed to clear the remaining fidelity gate.
