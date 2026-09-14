import AppKit
import Foundation

let paths = CommandLine.arguments.dropFirst()
guard !paths.isEmpty else {
    FileHandle.standardError.write(Data("Usage: file-clipboard /path/to/file [...]\n".utf8))
    exit(2)
}
let urls = paths.map { NSURL(fileURLWithPath: String($0)) }
let pasteboard = NSPasteboard.general
pasteboard.clearContents()
guard pasteboard.writeObjects(urls) else {
    FileHandle.standardError.write(Data("Could not write file URLs to NSPasteboard.\n".utf8))
    exit(1)
}
print("Wrote \(urls.count) local file URL(s) to NSPasteboard.")
