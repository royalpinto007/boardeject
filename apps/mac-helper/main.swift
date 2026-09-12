import AppKit
import Foundation

// Explicit one-shot capture. No listener, server, or clipboard mutation.
struct Flavor: Codable { let uti: String; let base64: String }
struct Capture: Codable {
    let format = "boardeject.clipboard"
    let version = 1
    let flavors: [Flavor]
}
enum CaptureError: Error { case changed, empty, tooLarge, unavailable }

func capture(_ pasteboard: NSPasteboard) throws -> Capture {
    let changeCount = pasteboard.changeCount
    let types = pasteboard.types ?? []
    guard !types.isEmpty && types.count <= 128 else { throw CaptureError.empty }
    guard types.contains(where: { $0.rawValue.contains("freeform") || $0.rawValue == "com.apple.drawing" }) else { throw CaptureError.empty }
    var total = 0
    var flavors: [Flavor] = []
    for type in types {
        guard pasteboard.changeCount == changeCount else { throw CaptureError.changed }
        guard let data = pasteboard.data(forType: type) else { throw CaptureError.unavailable }
        total += data.count
        guard total <= 32 * 1024 * 1024 else { throw CaptureError.tooLarge }
        flavors.append(Flavor(uti: type.rawValue, base64: data.base64EncodedString()))
    }
    guard pasteboard.changeCount == changeCount else { throw CaptureError.changed }
    return Capture(flavors: flavors)
}

do {
    guard CommandLine.arguments.count == 2 else {
        FileHandle.standardError.write(Data("Usage: boardeject-helper /path/to/selection.boardeject\nCopy your Freeform selection first. This captures clipboard bytes without uploading them.\n".utf8))
        exit(2)
    }
    let destination = URL(fileURLWithPath: CommandLine.arguments[1])
    let payload = try JSONEncoder().encode(capture(NSPasteboard.general))
    try payload.write(to: destination, options: .withoutOverwriting)
    FileHandle.standardError.write(Data("Capture saved. Choose this file in BoardEject. Treat it as private board content.\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Capture failed. Check that Freeform items are copied, clipboard contents did not change, the selection is below 32 MiB, and the output file does not already exist.\n".utf8))
    exit(1)
}
