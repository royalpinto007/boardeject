#!/bin/bash
set -euo pipefail

output=${1:-dist/macos-helper}
mkdir -p "$output"
xcrun swiftc apps/archive-helper/main.swift -lsqlite3 -o "$output/boardeject-archive-native"
xcrun swiftc apps/mac-helper/main.swift -o "$output/boardeject-capture"
bun build --compile scripts/archive-freeform.ts --outfile "$output/boardeject-mac"
cp docs/helper-package-README.txt "$output/README.txt"
chmod 755 "$output/boardeject-mac" "$output/boardeject-archive-native" "$output/boardeject-capture"
