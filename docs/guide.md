# BoardEject guide

BoardEject has two local workflows: editable export and local backup.

## Install the Mac helper

Download the Apple-silicon helper from the [v0.0.3 release](https://github.com/royalpinto007/boardeject/releases/download/v0.0.3/BoardEject-macOS.zip) and unzip it.

The downloadable preview needs no Node.js, npm, Git clone, Swift, or Xcode Command Line Tools.

It is currently unsigned, so macOS may ask you to approve it in Privacy & Security.

Intel Macs currently require the source build documented below.

## Export to editable Excalidraw

1. Select objects in Apple Freeform and press Cmd+C.
2. From the unzipped helper directory, run `./boardeject-capture ~/Desktop/Selection.boardeject`.
3. Open [Capture Tester](https://boardeject.dev/test-capture) and choose the saved file.
4. Review converted, partial, and unsupported findings.
5. Preview or download the editable `.excalidraw` result.

Browsers cannot read Apple's private Freeform pasteboard types directly.

The capture helper reads one pasteboard snapshot, verifies its change count, refuses to overwrite an existing file, and sends nothing over the network.

A `.boardeject` capture can contain content or metadata not visible on the board, so keep it private unless you deliberately sanitize it.

## Back up a Freeform board

From the unzipped helper directory, run:

```sh
./boardeject-mac scan
./boardeject-mac create BOARD_UUID ~/Desktop/Board.boardejectarchive
./boardeject-mac verify ~/Desktop/Board.boardejectarchive
```

The archive helper creates a stable private copy of the Freeform database, WAL, and SHM files.

It never opens or modifies the live database and operates only on the copied snapshot in read-only mode.

`create` extracts exactly the selected board, preserves reachable original assets, builds the archive, and verifies it before reporting success.

Unknown schemas fail closed, existing output files are never overwritten, and temporary snapshot files are deleted after the command completes.

Restore, write-back, iCloud manipulation, and database repair are not supported.

The archive path currently supports only the exact verified Freeform 4.5 schema described in the [fidelity and evidence document](fidelity.md).

## Build from source

Developers can clone the repository, install Node 22.12 or newer, and run `npm ci`.

Compile the clipboard helper with:

```sh
xcrun swiftc apps/mac-helper/main.swift -o /tmp/boardeject-capture
```

Use the source archive flow with:

```sh
npm run archive:freeform -- scan
npm run archive:freeform -- create BOARD_UUID Board.boardejectarchive
npm run archive:freeform -- verify Board.boardejectarchive
```

## Privacy and support

BoardEject has no account system, board uploads, cloud storage, or analytics pipeline for board content.

Read the public [Privacy](https://boardeject.dev/privacy), [Terms](https://boardeject.dev/terms), and [Support](https://boardeject.dev/support) pages before using it with important work.
