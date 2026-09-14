import AppKit
import Foundation
import UniformTypeIdentifiers

let paths = CommandLine.arguments.dropFirst()
guard !paths.isEmpty else {
    FileHandle.standardError.write(Data("Usage: file-clipboard /path/to/file [...]\n".utf8))
    exit(2)
}
let pasteboard = NSPasteboard.general
pasteboard.clearContents()
let items = try paths.map { value -> NSPasteboardItem in
    let url = URL(fileURLWithPath: String(value)).standardizedFileURL
    let bytes = try Data(contentsOf: url, options: .mappedIfSafe)
    guard let contentType = UTType(filenameExtension: url.pathExtension) else {
        throw NSError(domain: "BoardEjectClipboard", code: 1)
    }
    let item = NSPasteboardItem()
    item.setString(url.absoluteString, forType: .fileURL)
    item.setData(bytes, forType: NSPasteboard.PasteboardType(contentType.identifier))
    return item
}
guard pasteboard.writeObjects(items) else {
    FileHandle.standardError.write(Data("Could not write file data to NSPasteboard.\n".utf8))
    exit(1)
}
print("Wrote \(items.count) local file payload(s) to NSPasteboard.")
