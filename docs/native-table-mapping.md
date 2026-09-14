# Native table mapping

BoardEject's table recovery is derived from genuine Freeform 4.5 clipboard
captures on macOS 26.6.2. Unknown record layouts fail closed. The parser never
searches for user text or `crdt` marker bytes to infer boundaries.

Each table is an independently length-framed archive bundle. Its header names
and sizes `capsuleData`, `commonCRDTData`, and `specificCRDTData`. Multiple
tables are decoded bundle by bundle and matched to their native object UUIDs.
Unrelated surrounding items remain unsupported instead of being mistaken for
table data.

Within a table capsule, the root object's ordered axis collections reference a
key pool. Dimension records use one axis UUID. Cell records use a tuple of row
and column UUIDs. Joining those identifiers reconstructs cell ownership even
when serialization order differs from visual order. Native dimensions must be
positive, complete, unique, and sum to the frame width and height.

## Verified native behavior

Regression fixtures prove:

- independent and combined unequal row heights and column widths
- empty and multiline cells
- inserted, deleted, and reordered rows and columns
- bold, italic, font-size, left/center/right alignment metadata
- solid text and cell background colors
- border visibility, width, solid/dotted style, color, and outer-only preset
- two separately framed tables, including a selection with surrounding text
- attached text boxes in A1 and B2, where native row/column identities prove
  cell ownership

Table cells, cell text, and attached text boxes remain editable and grouped in
Excalidraw. Outer-only borders retain their native preset as source metadata,
but Excalidraw's independent cell rectangles can show internal edges. Exact
Freeform padding for attached text is also approximated.

## Proven platform boundaries

Freeform 4.5 exposes no table merge or unmerge command in its Table menu,
contextual controls, or documented table workflow. Minimal horizontal,
vertical, larger-region, and merge-to-unmerge captures therefore cannot be
created in that version. BoardEject's format-independent table converter still
validates explicit spans, but native merged-table support is not claimed.

Freeform 4.5 also exposes resize handles for tables, not a table rotation
operation. Two fresh Command-drag rotation probes changed dimensions while the
native rotation field remained exactly `0`. BoardEject does not reinterpret
those resizes as rotation evidence and continues to reject nonzero table
rotation.

Embedded text boxes are verified. Other attached item classes, including image
assets, remain unsupported by this narrow version-7 recovery path and must be
reported rather than silently omitted.

## Evidence

The fixture READMEs link the exact GitHub Actions runs used for each promoted
capture. Failed resize, rotation, clipboard-paste, and attachment attempts are
not fixtures. The original mapping was informed by
[libfreeform's bounded archive notes](https://github.com/can1357/libfreeform/blob/f35764612125ea8385239990ce4f3655b0f4297f/docs/FORMAT.md),
while every version-7 field used in production is backed by the project's own
native differentials.

Apple's [Freeform table guide](https://support.apple.com/guide/freeform/add-a-table-frfm88aa30f3/mac)
documents resizing, formatting, and attaching items to cells. It does not
offer merge or rotate operations for tables.
