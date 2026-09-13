# Native table differentials

Source: [Freeform Actions run 34739566232](https://github.com/royalpinto007/boardeject/actions/runs/34739566232).
The committed GUI recipe created a fresh 2x2 table in Freeform 4.5 on macOS
26.6.2. Baseline screenshot and clipboard text confirm A1/B1 on the first row,
A2/B2 on the second. Each change replaces exactly one cell with X1 through X4;
each restore returns to the baseline before the next change.

All original flavor lengths and SHA-256 hashes were checked using
`tools/freeform-experiment/compare.py`. Full artifacts are preserved outside the
repository. These files are unchanged native CRL, RTF and UTF-8 payload bytes.
Sanitization selects only these minimal payloads, excluding session diagnostics,
screenshots, redundant representations and executables. Content is limited to
the test table and native object identifiers, not personal board content.

## Proven mapping and remaining gap

UTF-8 uses row-major tab-separated cells and newline-separated rows. RTF has
four `\cell` and two `\row` terminators. Its `\cellx`, `\clwWidth` and
`\clheight` structure stays unchanged in every one-cell mutation and restore.
Each mutation changes exactly one contiguous byte range in both UTF-8 and RTF.

CRL changes are not isolated text substitutions: mutations alter 128, 132, 98
and 132 byte ranges respectively. A text match at an arbitrary offset is not
proof of a cell record or coordinate. Native CRL row/column ownership, board
coordinates and table geometry are **not yet mapped**. RTF layout dimensions
are not assumed to be Freeform canvas coordinates.

These fixtures verify native text ordering and stable RTF table structure,
not production table conversion. libfreeform reports minimum version 7 as
unsupported. The regression tests retain that gate. No production parser
behavior has been changed on the strength of text-only evidence.
