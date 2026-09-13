import AppKit
import ApplicationServices

// Posts ordinary mouse events to the disposable runner's foreground UI.
let args = CommandLine.arguments
guard args.count >= 5, let x1 = Double(args[1]), let y1 = Double(args[2]),
      let x2 = Double(args[3]), let y2 = Double(args[4]), CGPreflightPostEventAccess() else { exit(2) }
let flags: CGEventFlags = args.contains("--command") ? .maskCommand : []
func event(_ type: CGEventType, _ point: CGPoint) {
    let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)!
    e.flags = flags
    if args.contains("--double") { e.setIntegerValueField(.mouseEventClickState, value: 2) }
    e.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.025)
}
event(.mouseMoved, CGPoint(x: x1, y: y1))
if args.contains("--double") {
    event(.leftMouseDown, CGPoint(x: x1, y: y1))
    event(.leftMouseUp, CGPoint(x: x1, y: y1))
    exit(0)
}
Thread.sleep(forTimeInterval: 0.3)
event(.leftMouseDown, CGPoint(x: x1, y: y1))
for step in 1...30 {
    let t = Double(step) / 30
    event(.leftMouseDragged, CGPoint(x: x1 + (x2-x1)*t, y: y1 + (y2-y1)*t))
}
event(.leftMouseUp, CGPoint(x: x2, y: y2))
