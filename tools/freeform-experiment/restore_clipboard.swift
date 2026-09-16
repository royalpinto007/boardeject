import AppKit
import Foundation

struct Flavor: Decodable {
    let uti: String
    let base64: String
}

struct Capture: Decodable {
    let format: String
    let version: Int
    let flavors: [Flavor]
}

guard CommandLine.arguments.count == 2 else {
    fputs("Usage: restore-clipboard selection.boardeject\n", stderr)
    exit(2)
}

let source = URL(fileURLWithPath: CommandLine.arguments[1])
let capture = try JSONDecoder().decode(Capture.self, from: Data(contentsOf: source))
guard capture.format == "boardeject.clipboard", capture.version == 1, !capture.flavors.isEmpty else {
    fputs("Unsupported BoardEject capture.\n", stderr)
    exit(1)
}

let item = NSPasteboardItem()
for flavor in capture.flavors {
    guard let bytes = Data(base64Encoded: flavor.base64) else {
        fputs("Invalid capture data.\n", stderr)
        exit(1)
    }
    item.setData(bytes, forType: NSPasteboard.PasteboardType(flavor.uti))
}
let pasteboard = NSPasteboard.general
pasteboard.clearContents()
guard pasteboard.writeObjects([item]) else {
    fputs("Could not restore the captured Freeform selection.\n", stderr)
    exit(1)
}
print("Restored \(capture.flavors.count) genuine Freeform clipboard flavors.")
