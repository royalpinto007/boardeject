import AppKit
import Foundation

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var bridge: Process?
    private var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "↗"
        item.button?.toolTip = "BoardEject Helper"
        let menu = NSMenu()
        menu.addItem(withTitle: "Open BoardEject", action: #selector(openBoardEject), keyEquivalent: "o")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Quit Helper", action: #selector(quit), keyEquivalent: "q")
        item.menu = menu
        statusItem = item

        do {
            try startBridge()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.openBoardEject() }
        } catch {
            showError("The local bridge could not start. \(error.localizedDescription)")
        }
    }

    private func startBridge() throws {
        guard let executable = Bundle.main.executableURL else {
            throw NSError(domain: "BoardEject", code: 1, userInfo: [NSLocalizedDescriptionKey: "The app bundle is incomplete."])
        }
        let bridgeURL = executable.deletingLastPathComponent().appendingPathComponent("boardeject-mac")
        let process = Process()
        process.executableURL = bridgeURL
        process.arguments = ["bridge"]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        bridge = process
    }

    @objc private func openBoardEject() {
        NSWorkspace.shared.open(URL(string: "https://boardeject.dev/#archive")!)
    }

    @objc private func quit() {
        bridge?.terminate()
        NSApplication.shared.terminate(nil)
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "BoardEject Helper"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }

    func applicationWillTerminate(_ notification: Notification) {
        bridge?.terminate()
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
