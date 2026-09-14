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

The attempted combined resize, row reorder, insert, and delete operations did
not produce the intended native change and were not promoted. A successful
process exit is not treated as evidence.

For each promoted single-table case, the CRL payload is accompanied by the
public UTF-8 and RTF clipboard representations when Freeform supplied them.
Screenshots, manifests, binaries, diagnostics, redundant flavors and failed
attempts remain outside the repository. Tests establish behavior from CRL;
public text and RTF are retained as independent review evidence.
