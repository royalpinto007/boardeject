# Apple framework reference

`pencilkit-reference.json` is unmodified numerical output from BoardEject's
[macOS validation run 34703744158](https://github.com/royalpinto007/boardeject/actions/runs/34703744158).
The public `tools/native-validation/main.swift` generates a four-control pen
stroke, serializes and reloads it using PencilKit, then samples its path at
parametric intervals of 0.125 and applies its translation.

This is Apple-generated reference data, not a Freeform clipboard capture.
It validates this centerline case and endpoint behavior only. It does not
validate masked strokes, variable-width rendering, or native group transforms.
The fixture contains no user board data.
