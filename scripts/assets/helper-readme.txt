BoardEject for macOS
====================

This Universal app supports Apple silicon and Intel. It needs no Node.js, npm, Git clone, or local Swift compilation.

Open BoardEject Helper.app. It starts the localhost-only bridge and opens boardeject.dev. Scan, choose, create, save, and verify from the website.

CLI fallback for developers:

  "BoardEject Helper.app/Contents/MacOS/boardeject-capture" ~/Desktop/Selection.boardeject
  "BoardEject Helper.app/Contents/MacOS/boardeject-mac" scan
  "BoardEject Helper.app/Contents/MacOS/boardeject-mac" create BOARD_UUID ~/Desktop/Board.boardejectarchive
  "BoardEject Helper.app/Contents/MacOS/boardeject-mac" verify ~/Desktop/Board.boardejectarchive

macOS may require file access before Freeform storage can be read. BoardEject copies a stable snapshot and never writes to the live Freeform database. Only the exact verified Freeform 4.5 schema is accepted.

This app is ad-hoc signed but not Apple-notarized. If macOS blocks the first launch, Control-click the app, choose Open, and confirm once.
