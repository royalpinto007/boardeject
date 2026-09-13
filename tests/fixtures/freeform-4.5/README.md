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

## Image and text differentials

`image-baseline`, `image-moved`, `text-plain`, `text-bold`, and `text-mixed`
come from [run 34768466926](https://github.com/royalpinto007/boardeject/actions/runs/34768466926),
using `tools/freeform-experiment/images_text.py` at commit `5439bec`.
All payload sizes and SHA-256 hashes were checked against the original manifests.
Screenshots confirm the image and the three intended text styles in Freeform.
Only raw CRL, content-language JSON, and the original image resource are retained
unchanged. Full manifests/screenshots/logs remain in the external artifact archive.

The source art is a scripted 64×48 two-color RGBA PNG. Freeform's copied
`com.apple.apps.content-language.resource-*` payload is byte-identical to that
source, unlike the flattened `public.png` render. The content-language image
links it by exact identifier. Moving the image changes x by 11 points while
preserving y, dimensions and resource identity. Freeform adds a rounded Bézier
mask and a shadow; exporting only original pixels would lose those effects.

Text has alternating string/attribute-dictionary entries. The mixed capture
contains `Plain `, `Bold `, and `Italic` with separate archived NSFont values;
the latter two identify Helvetica-Bold and Helvetica-Oblique. Font archives are
system metadata, not private user content. Run boundaries and font descriptors
are evidence, not proof of editable rich-text conversion or font matching.

The upstream decoder leaves the image resource flavor unclassified and does
not recover the native text runs. BoardEject now uses these verified sidecars in
a narrow single-object fallback, with explicit image-effect/text approximations.
Standalone CRL and unrelated version-7 layouts remain unsupported. See
[fidelity details](../../../docs/fidelity.md). Track
[issue #14](https://github.com/royalpinto007/boardeject/issues/14).

`text-multiline-combined` comes from [run 34769628939](https://github.com/royalpinto007/boardeject/actions/runs/34769628939),
recipe commit `7b45754`. Manifest sizes/hashes were verified and the screenshot
confirms `First Bold` followed by `Both` on the next line, with the final run
in Helvetica-BoldOblique. Only the unchanged CRL and content JSON are retained.
The separate size-change attempt still had 18-point runs and is excluded.
It is not evidence for native size-change support.
