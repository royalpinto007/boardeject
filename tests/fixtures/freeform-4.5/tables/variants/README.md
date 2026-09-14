# Native table variant fixtures

These are minimal Apple Freeform 4.5 clipboard payloads captured by the
`tables-issue-15` scenarios on GitHub Actions macOS 26.6.2. They contain only
deterministic test table content and native object identifiers.

Run [34777479933](https://github.com/royalpinto007/boardeject/actions/runs/34777479933)
produced:

- `empty-baseline` and `multiline-A1`
- a matching formatting baseline plus bold, italic, larger-font and left-align
  differentials
- a two-table selection

Run [34777725492](https://github.com/royalpinto007/boardeject/actions/runs/34777725492)
produced:

- successful unequal-column and unequal-row resize differentials
- a successful column reorder differential

Run [34809848610](https://github.com/royalpinto007/boardeject/actions/runs/34809848610)
produced a successful combined unequal-column and unequal-row differential.
The decoded dimensions and screenshot independently agree.

Run [34810036922](https://github.com/royalpinto007/boardeject/actions/runs/34810036922)
produced successful row/column insertion and deletion differentials. Empty cells
introduced by Freeform are represented by native axis entries without cell text
objects. The failed row-reorder attempt was not promoted.

Run [34810302298](https://github.com/royalpinto007/boardeject/actions/runs/34810302298)
produced successful center- and right-alignment differentials. The native values
and visible text placement agree.

Run [34810514370](https://github.com/royalpinto007/boardeject/actions/runs/34810514370)
produced a successful row-reorder differential. Its attempted rotation changed
only the table dimensions and retained native rotation zero, so that attempt was
not promoted.

Run [34811243906](https://github.com/royalpinto007/boardeject/actions/runs/34811243906)
produced isolated text-color and cell-fill differentials. The decoded solid RGB
values match the visible A1 text and cell colors. The fixture names retain the
script's requested `red` label, while assertions use the exact resulting colors.

Run [34812179351](https://github.com/royalpinto007/boardeject/actions/runs/34812179351)
produced two spatially separate 2x2 tables with distinct A/B and C/D content,
followed by the same tables plus a surrounding text box. Each native object is
stored in an independently length-framed archive bundle. The fixtures verify
that both tables can be separated without scanning for record markers, while
the unrelated text remains explicitly unsupported by this version-7 recovery
path.

The attempted combined resize, row reorder, insert, and delete operations did
not produce the intended native change and were not promoted. A successful
process exit is not treated as evidence.

For each promoted single-table case, the CRL payload is accompanied by the
public UTF-8 and RTF clipboard representations when Freeform supplied them.
Screenshots, manifests, binaries, diagnostics, redundant flavors and failed
attempts remain outside the repository. Tests establish behavior from CRL;
public text and RTF are retained as independent review evidence.
