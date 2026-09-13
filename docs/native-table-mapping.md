# Native table mapping

The single-table capture stores three length-described records: capsuleData
(CRDT 7), commonCRDTData (CRDT 6), and specificCRDTData (CRDT 6). Recovery uses
these boundaries and verifies the common record's board UUID against the
upstream-decoded item identity. It does not search for text or marker offsets.

Within the capsule, field 6 contains a key pool. The root object's two ordered
axis collections reference keys through field 17. Dimension records use a
single UUID key; cell records use a tuple of the row and column keys. Joining
those identifiers reconstructs the grid even though records are serialized in
the order B1, A2, row, A1, row, column, B2, column.

The common record contains position, size and rotation. Native dimensions sum
to the frame: columns 344 + 344 = 688, rows 258 + 258 = 516. A separately
captured move changes (32, 54.5) to (52, 64.5), exactly matching twenty right
and ten down keyboard events. Screenshots confirm the movement.

Evidence: original run 34739566232, translation run 34751899165. Baseline,
four independent cell changes, four restores and translated table are tested
through the production file parser and Excalidraw exporter.

## Boundaries

Recovery requires one table, known record framing, unique contiguous axis
ordering, complete unique cell coverage, positive dimensions, matching frame
sums, no rotation and a matching board UUID. Unrecognized records return no
recovery; existing unsupported-version behavior applies. The native decoder's
compatibility status is never changed globally.

Output is grouped editable rectangles and plain text with default styling.
Fonts, colors, rich text, merged cells, nested assets, rotated/multiple tables
and general version-7 board conversion are not claimed supported. The attempted
resize did not change the table and provides no resize validation.

Upstream source inspected: [libfreeform format notes](https://github.com/can1357/libfreeform/blob/f35764612125ea8385239990ce4f3655b0f4297f/docs/FORMAT.md)
and its bounded archive framing. The new capsule mapping comes from the native
differential captures, not the simplified upstream table test schema.
