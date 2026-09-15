#!/bin/bash
set -euo pipefail

output=${1:-dist/macos-helper}
build_dir="$output/.build"
app="$output/BoardEject Helper.app"
executables="$app/Contents/MacOS"
mkdir -p "$build_dir" "$executables"

build_swift_universal() {
  source=$1
  destination=$2
  shift 2
  xcrun swiftc "$source" -target arm64-apple-macosx13.0 "$@" -o "$build_dir/${destination}-arm64"
  xcrun swiftc "$source" -target x86_64-apple-macosx13.0 "$@" -o "$build_dir/${destination}-x86_64"
  xcrun lipo -create "$build_dir/${destination}-arm64" "$build_dir/${destination}-x86_64" -output "$executables/$destination"
}

build_bun_universal() {
  source=$1
  destination=$2
  bun build --compile --target=bun-darwin-arm64 "$source" --outfile "$build_dir/${destination}-arm64"
  bun build --compile --target=bun-darwin-x64 "$source" --outfile "$build_dir/${destination}-x86_64"
  xcrun lipo -create "$build_dir/${destination}-arm64" "$build_dir/${destination}-x86_64" -output "$executables/$destination"
}

build_swift_universal apps/archive-helper/main.swift boardeject-archive-native -lsqlite3
build_swift_universal apps/mac-helper/main.swift boardeject-capture
build_swift_universal apps/helper-launcher/main.swift "BoardEject Helper" -framework AppKit
build_bun_universal scripts/archive-freeform.ts boardeject-mac
build_bun_universal apps/local-bridge/server.ts boardeject-bridge
cp scripts/assets/mac-helper-Info.plist "$app/Contents/Info.plist"
cp scripts/assets/helper-readme.txt "$output/README.txt"
chmod 755 "$executables"/*
rm -rf "$build_dir"
codesign --force --deep --sign - "$app"
