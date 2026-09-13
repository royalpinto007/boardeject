# Confirmed minimal Freeform captures

Source: [Actions run 34737707578](https://github.com/royalpinto007/boardeject/actions/runs/34737707578),
macOS 26.6.2, Freeform 4.5. All objects were created in a new board by the
committed experimental UI recipe. Clipboard contents were cleared before copy.
Every original payload's byte count and SHA-256 were verified against its
artifact manifest before selection. The full artifacts are preserved outside
the repository, independently of Actions retention.

Sanitization is by minimization, not binary editing. Only CRLNativeData,
TSUDescription, and the content-language JSON are retained, byte-for-byte.
Excluded: screenshots, render duplicates, TIFF/PNG, session diagnostics,
executables, app metadata, and unrelated clipboard types. Retained random
object identifiers are necessary to test relationships. Font archives describe
system fonts. These fixtures contain only our generated shapes and test text,
not personal boards, account information, or machine paths. Secret scan passed.

Confirmed with native payloads and screenshots:

- `rich-text`: the exact string `BoardEject native text 123`, Helvetica-Bold.
- `bound-connectors`: two shapes and a connection line with native object-ID anchors.
- `nested-transformed-group`: two levels of grouping, three shapes, translation.
- `nested-transformed-group-scaled`: same hierarchy, scale 0.8, shape widths 120.
- `nested-transformed-group-rotated`: same scaled group, angle about 315.40924 degrees.

These are native regression inputs, **not a claim of conversion support**.
libfreeform 1.0.0 reports minimum version 7 as unsupported and does not recover
their semantic geometry. Tests preserve that fail-closed behavior. JSON evidence
is inspected independently; production does not silently substitute it for CRL.
Failed table attempts and unverified ink are deliberately excluded.
