# Changelog

## 0.0.3 - 2026-09-15

- Added local Freeform 4.5 board discovery and strict verified title decoding with a safe UUID fallback.
- Added selected-board-only native extraction without modifying the live Freeform database, WAL or SHM files.
- Preserved original image, PDF, video and generic file bytes with SHA-256 manifests and safe deduplication.
- Added deterministic `.boardejectarchive` creation and independent integrity verification, including corruption, tampering and unsafe-path detection.
- Added strict schema fingerprint gating and fail-closed handling for unknown Freeform database versions.
- Kept restore, write-back, iCloud manipulation and unverified database-native Excalidraw reconstruction explicitly unsupported.

## 0.0.2 - 2026-09-14

- Added verified native table conversion for unequal dimensions, structural edits, ordering, multiple tables, colors, borders, and attached text.
- Preserved verified image masks and shadow parameters, with documented blur approximation, plus improved editable mixed and multiline text handling.
- Fixed ink mask safety and added Apple-generated width/force decoder coverage.
- Documented genuine macOS Freeform 4.5 Pen behavior and moved Apple Pencil pressure/eraser validation to future iPad work in issue #20.
- Expanded browser checks to exercise all 68 genuine Freeform captures and the legal, responsive, local-first website flow.

## 0.0.1 - 2026-09-13

- Versioned clipboard envelope and libfreeform WASM decoding.
- Conservative native adapter with explicit fidelity diagnostics.
- Editable Excalidraw export and official editor integration.
- Synthetic example, regression tests and recorded editing proof.
- One-shot Swift capture helper and macOS compilation CI.

- Real macOS native captures and table differentials with 50 regression tests.
- Privacy/terms pages and explicit support matrix.

Early limited-scope release. Version-7 native boards remain rejected; native tables, nonidentity group transforms, native assets/rich text and erased or pressure-sensitive ink are not claimed complete. See the README support matrix.
