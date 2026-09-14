# Capture on macOS

BoardEject uses a small command-line helper because browsers cannot read
Freeform's private clipboard types. The helper has been compiled on clean
GitHub-hosted macOS runners, and the same native pasteboard path has produced
the genuine Freeform 4.5 fixtures used by the regression suite.

With Xcode Command Line Tools installed:

```sh
xcrun swiftc apps/mac-helper/main.swift -o /tmp/boardeject-helper
```

1. Select your objects in Apple Freeform, then press Cmd+C.
2. Run `/tmp/boardeject-helper /tmp/selection.boardeject`.
3. Open [boardeject.dev/test-capture](https://boardeject.dev/test-capture) and
   choose that capture file.
4. Review unsupported findings before downloading any output.

The helper reads a single pasteboard snapshot, verifies its change count, and
refuses to overwrite an existing file. It does not replace your clipboard,
start a server, or send anything over the network. The capture contains the
original clipboard bytes and should be treated as confidential.

Browser clipboard access cannot reliably read Apple's private pasteboard types.
The browser clipboard button accepts a BoardEject JSON envelope copied as text;
it does not bypass this operating-system restriction. File import is the
recommended helper workflow. Freeform PDF exports are not supported as editable
input.

## Clean setup

1. Install Apple's Xcode Command Line Tools with `xcode-select --install` if
   `xcrun swiftc --version` is unavailable.
2. Clone BoardEject and run the compile command above from the repository root.
3. Use a new output filename for every capture. The helper intentionally refuses
   to overwrite an existing file.

The helper exits without writing a partial capture if the clipboard changes
during the read, contains no Freeform or Apple drawing payload, exposes an
unreadable flavor, or exceeds the capture safety limit. Copy the Freeform
selection again and retry with a new destination. A `.boardeject` file can
contain text, images, and metadata not visible on the board, so keep it private
unless you have deliberately sanitized it.

Freeform 4.5 on macOS is covered only for the fixture-backed subsets in the
[support matrix](../README.md#support-matrix). This helper does not turn an
unsupported native structure into a supported conversion.
