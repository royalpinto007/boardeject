# BoardEject guide

BoardEject has two local workflows: editable export and local archive.

## Install the Mac helper

Download the helper DMG from [boardeject.dev/mac-helper](https://boardeject.dev/mac-helper), open it, and drag BoardEject Helper to Applications.

The app supports Apple silicon and Intel and needs no Node.js, npm, Git clone, Swift, or Xcode Command Line Tools.

The DMG contains a Universal app for Apple silicon and Intel Macs. A [ZIP fallback](https://downloads.boardeject.dev/BoardEject-macOS-universal.zip) is also available.

Open **BoardEject Helper.app**. It starts a localhost-only bridge, opens boardeject.dev, and stays available from the macOS menu bar. The website then shows **Helper connected** and lets you scan, choose, create, save, and verify without terminal commands.

Allow local network access if your browser asks. This permission lets boardeject.dev reach the helper on `127.0.0.1`; it does not expose the helper to your network.

The bridge listens only on `127.0.0.1`, accepts only approved BoardEject origins, and uses a new in-memory session token each time it starts. All Freeform database, asset, archive, and verification work stays on the Mac.

The helper is ad-hoc signed but not Apple-notarized. On the first launch, open it once and dismiss the warning. Open **System Settings → Privacy & Security**, scroll to **Security**, click **Open Anyway**, authenticate, then confirm **Open**. macOS saves that exception for later launches. Follow [Apple's current Gatekeeper guidance](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac) and approve only the helper downloaded from boardeject.dev.

After approval, the helper waits for its private localhost bridge, opens boardeject.dev, and the website retries detection automatically. If the browser asks for Local Network Access, allow it so boardeject.dev can reach the helper at `127.0.0.1`; this does not grant access to another computer or upload a board. Use the helper's menu-bar menu to enable **Launch at Login** if you want it ready after restarting your Mac.

## Export to editable Excalidraw

1. Select objects in Apple Freeform and press Cmd+C.
2. Click **Import copied selection** on [boardeject.dev](https://boardeject.dev/#export).
3. Review converted, partial, and unsupported findings.
4. Preview or download the editable `.excalidraw` result.

Browsers cannot read Apple's private Freeform pasteboard types directly.

The localhost helper reads one pasteboard snapshot only after the explicit Import action, verifies its change count, and sends nothing to a BoardEject server.

Use **Capture-file fallback** or [Capture Tester](https://boardeject.dev/test-capture) only when you already have a `.boardeject` file or need the developer workflow. A capture can contain content or metadata not visible on the board, so keep it private unless you deliberately sanitize it.

## Archive a Freeform board

1. Open [boardeject.dev](https://boardeject.dev/#archive) with BoardEject Helper running.
2. Click **Scan Freeform** and choose a board.
3. Click **Create local archive**, then save the downloaded `.boardejectarchive`.
4. Click **Verify now** to check every manifest entry, asset hash, missing file, and corruption result.

The archive helper creates a stable private copy of the Freeform database, WAL, and SHM files.

It never opens or modifies the live database and operates only on the copied snapshot in read-only mode.

`create` extracts exactly the selected board, preserves reachable original assets, builds the archive, and verifies it before reporting success.

Unknown schemas fail closed, existing output files are never overwritten, and temporary snapshot files are deleted after the command completes.

Restore, write-back, iCloud manipulation, and database repair are not supported.

The archive path currently supports only the exact verified Freeform 4.5 schema described in the [fidelity and evidence document](fidelity.md).

The packaged `boardeject-mac scan`, `create`, and `verify` commands remain available as a developer fallback, but they are not required for the normal website flow.

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
