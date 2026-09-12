import AppKit
import Foundation
import CryptoKit

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let pb = NSPasteboard.general
if CommandLine.arguments.contains("--clear") { pb.clearContents(); exit(0) }
let count = pb.changeCount
var entries: [[String: Any]] = []
var total = 0
for (index, type) in (pb.types ?? []).enumerated() {
    guard let data = pb.data(forType: type), pb.changeCount == count else {
        throw NSError(domain: "UnstablePasteboard", code: 1)
    }
    total += data.count
    guard total <= 128 * 1024 * 1024 else { throw NSError(domain: "CaptureTooLarge", code: 2) }
    let name = String(format: "%03d.bin", index)
    try data.write(to: output.appendingPathComponent(name), options: .withoutOverwriting)
    entries.append(["uti": type.rawValue, "file": name, "bytes": data.count,
                    "sha256": SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()])
}
guard pb.changeCount == count else { throw NSError(domain: "UnstablePasteboard", code: 1) }
let manifest: [String: Any] = ["changeCount": count, "flavors": entries,
                             "verifiedFixture": false, "origin": "Freeform UI copy attempt; inspect action logs and screenshot before promotion"]
try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent("manifest.json"))
print("Captured \(entries.count) pasteboard flavors, \(total) bytes")
