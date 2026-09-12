# Capture on macOS

This helper source has not yet been tested against a live Freeform clipboard.
No Mac is currently available for end-to-end validation. Do not interpret a
passing Linux parser test as macOS compatibility certification.

With Xcode Command Line Tools installed:

```sh
swiftc apps/mac-helper/main.swift -o /tmp/boardeject-helper
```

1. Select your objects in Apple Freeform, then press Cmd+C.
2. Run `/tmp/boardeject-helper /tmp/selection.boardeject`.
3. Open BoardEject locally and choose that capture file.
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
