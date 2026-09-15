# BoardEject archive format

Status: format version 1, supported in BoardEject v0.0.3. Archive creation is
limited to genuinely verified source schemas and fails closed otherwise.

`*.boardejectarchive` is a ZIP-compatible container. Format version 1 uses a
canonical JSON manifest and SHA-256 integrity records so verification does not
require Apple Freeform or macOS.

```text
board.boardejectarchive
├── manifest.json
├── integrity.json
├── native/board/
│   └── native-records.json # only the selected board's native rows
├── assets/
│   └── <sha256>.<ext>
├── metadata/
│   ├── board.json
│   └── objects.json
├── previews/
│   └── preview.png         # optional
└── exports/
    └── board.excalidraw    # optional convenience export
```

## Manifest contract

`manifest.json` has `format: "boardeject.archive"` and `version: 1`. It records:

- archive creation time and verified source schema identity;
- board ID, title, timestamps and object count where proven;
- every payload file's path, role, byte size and SHA-256;
- every native asset reference, including source ID, related object IDs,
  original filename, MIME type, archive path and preservation status;
- missing-asset warnings;
- whether an optional editable Excalidraw export is present.

An asset may be `preserved`, `duplicate` or `missing`. Byte-identical assets
share one archive payload and keep separate native references. Original bytes
are not recompressed or transformed before being stored. File extensions are
sanitized and are not treated as proof of media type.

The optional Excalidraw file is a convenience export. Native snapshot data and
original assets are the preservation layer.

The byte-stable DB/WAL/SHM copy is a temporary safety boundary used by the
macOS helper. It is not embedded in the portable archive because it can contain
other boards. `native-records.json` retains the selected board's raw SQLite
values with explicit SQLite types and base64-encoded blobs. It includes only
rows related to the selected native UUID from the verified board, metadata,
item, asset-reference, freehand and command-history tables.

## Determinism

Entries are sorted by path, stored without ZIP compression, and use the ZIP
epoch timestamp. JSON object keys are sorted recursively. Given the same input,
including `createdAt`, the writer produces the same bytes.

## Integrity model

Each payload entry is covered by its manifest SHA-256 and byte size.
`integrity.json` covers the exact `manifest.json` bytes. Verification checks:

- ZIP parsing and truncation;
- required manifest and integrity records;
- supported format and schema status;
- safe relative paths and duplicate records;
- expected, missing and undeclared files;
- payload byte sizes and SHA-256 hashes;
- asset hashes, object references and deduplication relationships;
- optional export declarations.

This detects corruption and accidental modification. It is not a digital
signature and does not prove who created an archive. A person able to replace
both an archive and all of its checksums can construct a different valid
archive.

## Path safety

Archive paths must be relative, use `/`, and contain no empty, `.` or `..`
segments. Drive paths, absolute paths, backslashes and NUL bytes are rejected.
Source filenames never become archive paths without sanitization. Verification
fails on undeclared entries.

## Compatibility

Version 1 readers reject an unsupported major manifest version. Additive fields
may be introduced only when older readers can ignore them safely. A breaking
layout or semantic change requires a new manifest version and a documented
migration strategy.

The source database adapter is a separate compatibility boundary. Archive
creation requires `schemaStatus: "verified"`, a database user version and a
structural fingerprint. Unknown schemas fail closed.

## Current validation boundary

The writer and independent verifier have regression coverage for determinism,
hashes, duplicate and missing assets, corruption, tampering, unsafe paths,
optional exports and large byte payloads. The macOS helper has a CI gate for
byte-stable DB/WAL/SHM copying without source changes.

Genuine Freeform 4.5 evidence now covers schema selection, two-board catalogue
and UUID-scoped extraction, plus original-byte resolution for image, PDF, video
and generic-file attachments. The portable archive generated from that evidence
contains only selected-board native rows and their reachable assets. The full
database copy is deliberately excluded because it may contain unrelated boards.

Board-title decoding is verified only for the exact Freeform 4.5 schema gate.
The strict decoder requires the proven CRDT field structure. Version 1 records
an explicit `titleStatus` and uses an `Untitled <UUID prefix>` fallback whenever
that structure is absent or invalid.

Native object-to-Excalidraw conversion from database rows is unavailable. The
existing converter starts from a decoded Freeform clipboard envelope, while
the database stores separate CRDT record fragments with no proven clipboard
selection manifest. These genuine fragments do not decode as a native board
through the existing parser. BoardEject does not reconstruct or guess that
envelope. An Excalidraw export remains optional in the format, and native
archive creation does not depend on it.

**Creates a local, verifiable archive of your Freeform board and original
assets. Restore back into Apple Freeform is not supported yet.**
