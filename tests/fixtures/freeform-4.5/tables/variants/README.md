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

The attempted combined resize, row reorder, insert, and delete operations did
not produce the intended native change and were not promoted. A successful
process exit is not treated as evidence.

For each promoted single-table case, the CRL payload is accompanied by the
public UTF-8 and RTF clipboard representations when Freeform supplied them.
Screenshots, manifests, binaries, diagnostics, redundant flavors and failed
attempts remain outside the repository. Tests establish behavior from CRL;
public text and RTF are retained as independent review evidence.
