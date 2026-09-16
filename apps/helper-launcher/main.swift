import AppKit
import Foundation
import ServiceManagement

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var bridge: Process?
    private var statusItem: NSStatusItem?
    private var launchAtLoginItem: NSMenuItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "↗"
        item.button?.toolTip = "BoardEject Helper"
        let menu = NSMenu()
        let openItem = menu.addItem(withTitle: "Open BoardEject", action: #selector(openBoardEject), keyEquivalent: "o")
        openItem.target = self
        if #available(macOS 13.0, *) {
            let loginItem = menu.addItem(withTitle: "Launch at Login", action: #selector(toggleLaunchAtLogin), keyEquivalent: "")
            loginItem.target = self
            launchAtLoginItem = loginItem
            updateLaunchAtLoginItem()
        }
        menu.addItem(NSMenuItem.separator())
        let quitItem = menu.addItem(withTitle: "Quit Helper", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        item.menu = menu
        statusItem = item

        do {
            try startBridge()
            openBoardEjectWhenReady(attempt: 0)
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

    private func openBoardEjectWhenReady(attempt: Int) {
        guard attempt < 20 else {
            openBoardEject()
            return
        }
        var request = URLRequest(url: URL(string: "http://127.0.0.1:48117/v1/status")!)
        request.setValue("https://boardeject.dev", forHTTPHeaderField: "Origin")
        URLSession.shared.dataTask(with: request) { _, response, _ in
            DispatchQueue.main.async {
                if (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.openBoardEject()
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        self.openBoardEjectWhenReady(attempt: attempt + 1)
                    }
                }
            }
        }.resume()
    }

    @available(macOS 13.0, *)
    private func updateLaunchAtLoginItem() {
        launchAtLoginItem?.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    @objc private func toggleLaunchAtLogin() {
        guard #available(macOS 13.0, *) else { return }
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
            updateLaunchAtLoginItem()
        } catch {
            showError("Launch at Login could not be changed. Move BoardEject Helper to Applications and try again.")
        }
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

if CommandLine.arguments.contains("--validate-launch-at-login") {
    if #available(macOS 13.0, *) {
        do {
            try SMAppService.mainApp.register()
            guard SMAppService.mainApp.status == .enabled else {
                throw NSError(domain: "BoardEject", code: 2, userInfo: [NSLocalizedDescriptionKey: "Launch at Login did not become enabled."])
            }
            try SMAppService.mainApp.unregister()
            print("Launch at Login registration is available.")
        } catch {
            fputs("Launch at Login validation failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
} else {
    let application = NSApplication.shared
    let delegate = AppDelegate()
    application.delegate = delegate
    application.setActivationPolicy(.accessory)
    application.run()
}
