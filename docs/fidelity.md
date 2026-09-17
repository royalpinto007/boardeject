# Fidelity and evidence

BoardEject v0.0.4 is a limited-scope release. The README support matrix distinguishes native evidence from tested converter behavior.

## What has actually been tested

- libfreeform 1.0.0 decodes the upstream binary regression fixtures.
- Invalid envelopes and duplicate clipboard types are rejected.
- Unknown/unsupported native versions do not produce fabricated output.
- The converter produces individual text, shape and freedraw objects.
- Synthetic arrows have reciprocal Excalidraw element bindings.
- Synthetic grouped objects retain group identifiers.
- Nested identity-transform native group graphs preserve membership and reject cycles.
- Genuine Freeform 4.5 nested-group sidecars preserve canvas-space translation, uniform scale, rotation and deepest-first grouping for the verified unflipped placeholder-shape subset.
- A genuine Freeform 4.5 two-shape connector sidecar preserves native center-anchor identities as reciprocal Excalidraw bindings without array-order correlation.
- Binary ink controls are decoded and sampled into editable freedraw elements.
- Valid drawing data survives an independently unsupported native board version.

## Important native parser limitations

### Why splitting text cannot preserve native mixed styles

The installed Excalidraw 0.18.1 `ExcalidrawTextElement` has one font size, numeric font-family ID, alignment and line height. It has no weight, italic, per-character runs, native baseline, or glyph-position fields. Its [font renderer](https://github.com/excalidraw/excalidraw/blob/v0.18.1/packages/excalidraw/utils.ts#L100) constructs the canvas font from size and family only. Splitting a bold/italic run into another text element does not add these missing capabilities. Grouping does not provide inline reflow or shared baselines when users edit those pieces. Custom fonts would require modifying the destination editor and would not travel as standard editable text in the downloaded file. Outlining or rasterizing text would cease to be text editing.

We therefore retain one coherent editable element with original line breaks and keep exact native run descriptors in customData. The genuine multiline fixture includes Helvetica-BoldOblique; both bold and italic flags now survive metadata conversion. They are not visually rendered. Original font family, kerning, baseline, per-run size changes and layout are not claimed to match. Adapter tests cover output size/alignment variations, but the attempted native font-size shortcut changed nothing and is not promoted as proof.

### Shadow comparison and remaining checklist

`tools/freeform-experiment/compare_shadow.py` compares SVG alpha to the genuine Freeform baseline PNG from run 34768466926, without adding the temporary render to Git. For that 64×48 image at 2x, the opaque image starts at (6,0) within the 140×108 render. Across 2,832 pixels outside the source rectangle, sigma 1.5 has mean absolute alpha error 7.138/255 versus 9.880/255 for sigma 3. This is a single-case improvement, not pixel equality or a general native-radius formula. The converter uses 1.5 only for the captured radius 3 / offset 2 / opacity 0.25 case; other parameters remain approximate. Original mask/pixels and shadow offset, color and opacity remain in the SVG. The board is never rasterized.

Absent or unverified shadow data causes safe rejection. BoardEject does not infer a no-shadow representation from a synthetic mutation.

Issue #14 classification at completion:

- **BoardEject implementation gaps for verified fixtures: none.** Resource correlation, image mask, captured shadow parameters, editable plain/mixed/ multiline text, combined bold-italic recognition, first-run size/alignment, original style metadata and safe unsupported reports have regression coverage.
- **Excalidraw format limitations:** no inline style-run model, weight/italic fields, native font-family embedding, shared editable baseline/reflow across grouped text pieces, independent image masks, or image shadow controls.
- **Unverified native variants:** no-shadow images, other mask/crop transforms, shadow radii/directions/colors, and per-run size/alignment changes have no genuine fixture. They remain unsupported instead of guessed. New genuine captures can extend the supported subset in later issues.

### Verified single-object image and text fallback

The content-language sidecar in the new native fixtures now supports a narrow single-object fallback alongside CRL. This is not general version-7 support. It requires the full capture envelope, including the image resource flavor; a standalone CRL file does not contain that resource.

Images preserve the original resource pixels and the captured absolute Bézier mask in an embedded SVG image. The verified downward shadow retains its offset, color and opacity. Mapping the native radius to SVG Gaussian blur is an explicit approximation, not a pixel-identical shadow claim. Effects become part of the movable/resizable image asset, not independent Excalidraw controls. Other crop types, mask transforms, shadow directions and missing resources are withheld.

Native mixed text becomes one editable Excalidraw text element, not an image. The first run supplies font size and paragraph alignment. Original run boundaries, font names, sizes, bold and italic descriptors are retained in `customData`. Excalidraw does not render mixed bold/italic runs, so these descriptors are metadata, not visible style support. Font family is substituted with its sans-serif font; color, padding and wrapping use defaults. This keeps editing coherent without guessing per-run glyph widths. Every fallback reports these losses.

Tests cover genuine baseline/moved images and plain/bold/mixed text, invalid archives and unsafe paths, plus browser file upload, image-mask pixels and preview. [Issue #14](https://github.com/royalpinto007/boardeject/issues/14) documents the implemented subset and supported-format limitations. No full rich-text or general image-effects support is claimed.

### Ink decoding and mask safety

Apple-generated width/force data has regression coverage. The paired native PencilKit fixtures expose a geometric mask that libfreeform does not return as visible ranges. BoardEject now detects this mask and omits the stroke with an unsupported report instead of restoring its hidden regions. This is conservative omission, not editable eraser reconstruction. Unmasked output remains a uniform-width approximation.

Genuine Freeform 4.5 captures prove the macOS Draw with Pen tool emits `CRLWPShapeItem` vector shapes, not `com.apple.drawing` or `CRLFreehandDrawingItem`. The tested macOS UI exposes no eraser. This is a platform boundary, not missing BoardEject decoding. Apple Pencil pressure and erased-ink round trips are iPad-originated behavior and remain unverified in [Issue #20](https://github.com/royalpinto007/boardeject/issues/20). Apple framework fixtures validate decoder behavior only. See the [Apple reference provenance](../tests/fixtures/apple/README.md).

The upstream `native-mixed` fixture exposes three identities but no geometry. The upstream `real-board` capture declares minimum version 7, which the decoder marks unsupported. Its decoded data lacks several text bodies, connector relationships, table cell data and image bytes. BoardEject withholds export of this capture. It does not infer omitted text or turn unknown presets into rectangles. Separate genuine Freeform 4.5 sidecars now recover only the bounded connector and nested-group subsets described below.

### Verified connector and nested-group sidecars

The connector capture contains two shapes and one connection line. BoardEject does not join them by array position. Each native anchor UUID must exist in the CRL item set, each endpoint must uniquely equal one shape center, and exactly one native identity must remain for the connector. That produces reciprocal Excalidraw bindings. Ambiguous centers, labels not proven by this capture, routing, arrowheads and unknown structures fail closed. Issue [#9](https://github.com/royalpinto007/boardeject/issues/9) still tracks one genuine labelled real-board fixture through the same public flow.

Three nested-group captures establish translation, then uniform scale, then rotation. Their leaf geometry changes directly in canvas space, so BoardEject preserves those leaf bounds and must not apply the group transform a second time. Derived child identities retain deepest-first Excalidraw grouping. The fallback requires the verified version-1 content-language hierarchy, matching group scale, canvas-space child angles, solid fills and placeholder-only text. Flips, labels, shear, malformed geometry and unknown child types reject the complete group. The supported-version native adapter continues to reject nonidentity `counterTransform` values because these sidecars do not establish that separate field's semantics.

The native adapter currently accepts only explicit supported versions, bounded canvas-space geometry, a small explicit shape-preset mapping, recovered plain text, and connectors with recovered endpoints. These adapter paths still need per-element native fixtures and real-device validation. They are not a support promise.

## Not yet implemented or validated

Adapter tests now cover embedded PNG/JPEG data, affine-transformed rendered ink samples, and complete axis-aligned table grids with merged cells. These tests use explicit decoded model inputs, not captured native records. They must not be represented as proof of end-to-end Freeform support.

- Native `counterTransform` composition, group flips/shear and group variants outside the verified content-language subset
- PencilKit masks and variable-width strokes (centerline endpoint sampling now matches a checked-in Apple framework reference; broader stroke cases remain unvalidated)
- Native image resource/effect variants outside the verified single-object case
- Native merged cells and attached item classes beyond verified text boxes
- Rich-text visual runs beyond Excalidraw's element model, font matching, path shapes and routing
- Full affine, flipped and nested geometry
- End-to-end conversion of current version-7 Freeform boards

Real Freeform GUI copy now has confirmed captures. Native table differential fixtures prove structure, dimensions, ordering, selected formatting and border properties, multiple independently framed tables, and attached text-box cell ownership. Merge and rotation are unavailable for tables in the tested Freeform version. Other version-7 layouts remain rejected. Track [table variants](https://github.com/royalpinto007/boardeject/issues/15) and [iPad Apple Pencil ink](https://github.com/royalpinto007/boardeject/issues/20).

The example board is synthetic. It is a converter demonstration, not a captured Apple Freeform board. No simulated Freeform UI or copy footage should be used in the demo.

## Native validation methodology

The macOS workflows compile the AppKit and PencilKit probes, record the macOS and Xcode versions, and preserve only sanitized, minimal Apple-generated evidence as regression fixtures.

Freeform GUI validation uses Accessibility and CGEvent automation on a hosted macOS session, then dumps every matching pasteboard flavor directly through `NSPasteboard`.

Every supported table mapping follows the same method: capture a genuine baseline, change one property, capture again, diff the native bytes and decoded structure, then add a bounded regression test.

Verified Freeform 4.5 table evidence covers unequal dimensions, empty and multiline cells, inserted/deleted/reordered rows and columns, formatting metadata, alignment, solid colors, borders, multiple independently framed tables, and attached text-box ownership.

The tested Freeform 4.5 UI exposes neither table merge nor table rotation controls, so those are source-platform limitations for that version rather than inferred converter features.

Raw personal databases, temporary captures, automation logs, and unverified experimental output are never permanent public fixtures.

See the fixture provenance files under `tests/fixtures/` and the open GitHub issues for the exact remaining captures needed to extend support.
