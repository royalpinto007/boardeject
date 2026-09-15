# Local Freeform Archive

Status: experimental development toward the v0.0.3 milestone. This is not a
shipped compatibility claim.

BoardEject is adding a second, separate workflow:

- **Export:** supported Freeform content becomes an editable Excalidraw file.
- **Archive:** a selected board becomes a local verified snapshot with native
  data, original assets, metadata, hashes and an optional Excalidraw export.

**Creates a local, verifiable archive of your Freeform board and original
assets. Restore back into Apple Freeform is not supported yet.**

## Safety boundary

The archive helper treats Freeform's live storage as read-only source material.
Its current snapshot command:

1. accepts an explicit database path and a new destination directory;
2. rejects symlinks and non-regular source files;
3. hashes the database and any present WAL/SHM files;
4. copies them into a private staging directory;
5. hashes the copies and checks the complete source set again;
6. publishes the snapshot directory only when every byte and source signature
   remains stable.

The helper never opens the live SQLite database. It never runs SQL, migration,
repair, checkpoint, vacuum or write operations against the source. A failed
copy removes only its newly created staging directory.

The snapshot command is an internal validation primitive:

```sh
swiftc apps/archive-helper/main.swift -lsqlite3 -o /tmp/boardeject-archive-helper
/tmp/boardeject-archive-helper snapshot /path/to/boards.db /path/to/new-snapshot
```

The experimental macOS orchestration keeps the intended flow narrow:

```sh
# Scan Freeform through a temporary verified snapshot.
npm run archive:freeform -- scan

# Choose a UUID from the scan result, then create and verify an archive.
npm run archive:freeform -- create BOARD_UUID Board.boardejectarchive
npm run archive:freeform -- verify Board.boardejectarchive
```

`create` repeats the stable snapshot, verifies the exact schema, extracts only
the selected UUID, preserves its reachable assets, creates the portable archive
and verifies it before reporting success. The temporary database copy and
intermediate files are deleted afterward. An existing output file is never
overwritten. A verified `.excalidraw` file can be included with
`--excalidraw FILE`; native preservation still succeeds when no editable export
is available.

## Verified experimental evidence

A genuine Freeform 4.5 run on macOS produced schema `user_version` 16 with the
exact fingerprint
`921b22ba14261263cf75237435f6667dde9620a8a3cbd4c651a8a28021ecf433`.
BoardEject copied the database, WAL and SHM without changing their source
hashes, opened only the copy with SQLite read-only and query-only modes, and
confirmed that a write probe was rejected.

Against that exact schema, the native helper now catalogs non-discardable
boards by native UUID, modified timestamp, active object count and active asset
reference count. A genuine two-board regression proved that extraction by UUID
retains one board, its metadata, active objects and reachable relationships
without including the other board's rows or marker content. Unknown schema
versions or fingerprints fail closed.

A separate genuine board contained an image, PDF, generated MP4 and generic
text file. Freeform stored seven referenced payloads, including its poster and
link-metadata sidecars. BoardEject resolved only the selected board's asset
UUIDs, copied all seven original byte streams, and matched the controlled source
hashes for the four original attachments. Each archived asset is hashed with
SHA-256; byte-identical payloads are safely deduplicated and missing references
remain explicit warnings.

The selected native rows and preserved bytes can now be assembled into the
documented `.boardejectarchive` format. The archive is independently verified
without Freeform for structure, declared paths, byte sizes, hashes, asset
relationships, missing files and optional Excalidraw output. A deliberately
corrupted archive must fail verification. The native database copy remains a
temporary safety boundary and is never placed in the portable archive because
it can contain unrelated boards.

Freeform board-title decoding is not verified. The catalogue therefore uses a
clearly marked fallback name and requires the native UUID for deterministic
selection. This is not an archive compatibility claim.

## Work still requiring native evidence

- locate Freeform storage reliably across supported macOS versions;
- prove board-title storage using a genuine rename differential;
- decode enough selected-board native object content to invoke the existing
  Excalidraw converter without guessing unsupported fields.

Freeform 4.5 schema version 16 with the exact fingerprint above is the only
verified experimental source. It is not advertised as shipped archive
compatibility while the end-to-end user flow remains incomplete.

## Reference research

The design reviewed
[soso-song/freeform-to-markdown](https://github.com/soso-song/freeform-to-markdown)
as an architectural reference. That project uses a source-copy boundary,
schema fingerprints, read-only SQLite access, original-byte asset preservation
and independent verification. It is Apache-2.0 licensed.

BoardEject's implementation and archive contract were written independently;
no source code was copied. If later work reuses licensed code, the required
Apache notices and change attribution must land with that change.

See [archive format](archive-format.md) for the draft portable contract.
