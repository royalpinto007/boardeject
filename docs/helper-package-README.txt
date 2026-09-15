BoardEject for macOS
====================

This package needs no Node.js, npm, Git clone, or local Swift compilation.

Open Terminal in this folder, then run:

  ./boardeject-capture ~/Desktop/Selection.boardeject
  ./boardeject-mac scan
  ./boardeject-mac create BOARD_UUID ~/Desktop/Board.boardejectarchive
  ./boardeject-mac verify ~/Desktop/Board.boardejectarchive

macOS may require Full Disk Access for Terminal before Freeform storage can be
read. BoardEject copies a stable snapshot and never writes to the live Freeform
database. Only the exact verified Freeform 4.5 schema is accepted.

This unsigned developer-preview package is the intermediate helper. A signed
Mac app with website detection is planned.
