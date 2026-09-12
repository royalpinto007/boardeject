# Fidelity and evidence

BoardEject is an open-source development preview, not a stable released exporter.

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
- Exact PencilKit endpoint policy, masks and variable-width strokes (uniform spline sampling is implemented)
- Native embedded image extraction and safe format conversion
- Editable native tables and merged cells
- Rich text runs, font matching, path shapes and routing
- Full affine, flipped and nested geometry
- Actual Freeform Cmd+C capture and macOS helper execution

The example board is synthetic. It is a converter demonstration, not a captured
Apple Freeform board. No simulated Freeform UI or copy footage should be used in
the demo.

See [native-validation.md](native-validation.md) for the source evidence and
the exact real captures needed to clear the remaining fidelity gate.
