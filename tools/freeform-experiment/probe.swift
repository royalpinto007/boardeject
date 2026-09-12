import AppKit
import ApplicationServices
import Foundation

// Read-only permission probe. Never prompts for or modifies TCC permissions.
let report: [String: Any] = [
    "accessibilityTrusted": AXIsProcessTrusted(),
    "keyboardPostingAllowed": CGPreflightPostEventAccess(),
    "session": CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:],
    "runningFreeform": NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.freeform").map { ["pid": Int($0.processIdentifier), "finishedLaunching": $0.isFinishedLaunching] }
]
let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
print(String(decoding: data, as: UTF8.self))
