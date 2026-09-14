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

The snapshot command is an internal validation primitive, not the user-facing
archive flow:

```sh
swiftc apps/archive-helper/main.swift -lsqlite3 -o /tmp/boardeject-archive-helper
/tmp/boardeject-archive-helper snapshot /path/to/boards.db /path/to/new-snapshot
```

## Work still requiring native evidence

- locate Freeform storage reliably across supported macOS versions;
- open only the copied database with SQLite read-only and query-only modes;
- fingerprint a genuine schema and fail closed on unknown structures;
- list and select the correct board using proven fields;
- prove board-scoped object and asset relationships;
- resolve original image, video, PDF and file bytes inside the verified Assets
  root without following symlinks;
- include the existing Excalidraw conversion only when the archived board is
  supported;
- run archive creation and verification end to end on genuine Freeform data.

No Freeform database schema is currently advertised as archive-compatible.

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
