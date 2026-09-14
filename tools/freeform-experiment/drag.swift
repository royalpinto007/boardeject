import AppKit
import ApplicationServices

// Posts ordinary mouse events to the disposable runner's foreground UI.
let args = CommandLine.arguments
guard args.count >= 5, let x1 = Double(args[1]), let y1 = Double(args[2]),
      let x2 = Double(args[3]), let y2 = Double(args[4]), CGPreflightPostEventAccess() else { exit(2) }
let flags: CGEventFlags = args.contains("--command") ? .maskCommand : []
let holdsCommand = args.contains("--command")
let mouseButton: CGMouseButton = args.contains("--right") ? .right : .left
let downEvent: CGEventType = args.contains("--right") ? .rightMouseDown : .leftMouseDown
let upEvent: CGEventType = args.contains("--right") ? .rightMouseUp : .leftMouseUp
func commandKey(_ down: Bool) {
    guard holdsCommand,
          let e = CGEvent(keyboardEventSource: nil, virtualKey: 55, keyDown: down) else { return }
    e.flags = down ? .maskCommand : []
    e.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.1)
}
func event(_ type: CGEventType, _ point: CGPoint, clicks: Int64 = 1) {
    let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: mouseButton)!
    e.flags = flags
    e.setIntegerValueField(.mouseEventClickState, value: clicks)
    e.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.025)
}
commandKey(true)
event(.mouseMoved, CGPoint(x: x1, y: y1))
if args.contains("--click") {
    event(downEvent, CGPoint(x: x1, y: y1))
    event(upEvent, CGPoint(x: x1, y: y1))
    commandKey(false)
    exit(0)
}
if args.contains("--double") {
    event(.leftMouseDown, CGPoint(x: x1, y: y1))
    event(.leftMouseUp, CGPoint(x: x1, y: y1))
    event(.leftMouseDown, CGPoint(x: x1, y: y1), clicks: 2)
    event(.leftMouseUp, CGPoint(x: x1, y: y1), clicks: 2)
    commandKey(false)
    exit(0)
}
Thread.sleep(forTimeInterval: 0.3)
event(.leftMouseDown, CGPoint(x: x1, y: y1))
for step in 1...30 {
    let t = Double(step) / 30
    event(.leftMouseDragged, CGPoint(x: x1 + (x2-x1)*t, y: y1 + (y2-y1)*t))
}
event(.leftMouseUp, CGPoint(x: x2, y: y2))
commandKey(false)
