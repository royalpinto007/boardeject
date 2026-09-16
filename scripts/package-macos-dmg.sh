#!/bin/bash
set -euo pipefail

source_dir=${1:-dist/macos-helper}
destination=${2:-BoardEject-macOS.dmg}
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

ditto "$source_dir/BoardEject Helper.app" "$stage/BoardEject Helper.app"
ln -s /Applications "$stage/Applications"
hdiutil create -quiet -format UDZO -volname "BoardEject Helper" -srcfolder "$stage" "$destination"
