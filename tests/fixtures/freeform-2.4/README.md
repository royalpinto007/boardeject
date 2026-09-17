# Genuine Freeform 2.4 compatibility evidence

These minimal fixtures were copied byte-for-byte from fresh boards created by the committed macOS automation on GitHub's `macos-14` runner. That runner reported macOS 14.8.9 and Freeform 2.4.

The labelled connector came from [Actions run 35216500964](https://github.com/royalpinto007/boardeject/actions/runs/35216500964). The image and text selections came from [Actions run 35216652342](https://github.com/royalpinto007/boardeject/actions/runs/35216652342). [Actions run 35216655392](https://github.com/royalpinto007/boardeject/actions/runs/35216655392) confirmed that this Freeform version does not expose the Table menu used by the native capture automation.

Freeform 2.4 uses `com.apple.freeform.CRLDescription` instead of `com.apple.freeform.TSUDescription`, provides no content-language canvas-object sidecar, and declares native minimum version 7. The retained payloads recover class identity and some geometry, but not the labelled connector's text or endpoint bindings, the text object's editable body, or the image's original asset bytes. BoardEject therefore recognizes this legacy description flavor for diagnostics and keeps these captures fail-closed.

Sanitization is by minimization, not binary editing. Only CRL native/description payloads and the exact plain-text companion for the text case are retained. Screenshots, rendered PNG/TIFF clipboard flavors, session logs, UI trees, executables, app metadata and unrelated clipboard types are excluded. The fixtures contain only generated test objects and text.
