import AppKit
import Foundation
#if canImport(PencilKit)
import PencilKit
#endif

// This tool creates its own data. It never reads the user's general clipboard.
guard CommandLine.arguments.count == 2 else {
    fputs("Usage: native-validation OUTPUT_DIRECTORY\n", stderr)
    exit(2)
}
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
func saveJSON(_ value: Any, _ name: String) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: output.appendingPathComponent(name), options: .atomic)
}

var report: [String: Any] = [
    "macOS": ProcessInfo.processInfo.operatingSystemVersionString,
    "freeformPresent": FileManager.default.fileExists(atPath: "/System/Applications/Freeform.app") || FileManager.default.fileExists(atPath: "/Applications/Freeform.app"),
    "fixtureOrigin": "Programmatically generated with Apple frameworks, not captured from Freeform",
    "freeformClipboardValidated": false
]

let pasteboard = NSPasteboard.withUniqueName()
defer { pasteboard.releaseGlobally() }
let payload = Data("BoardEject native validation".utf8)
pasteboard.declareTypes([.string], owner: nil)
guard pasteboard.setData(payload, forType: .string), pasteboard.data(forType: .string) == payload else {
    throw NSError(domain: "BoardEject", code: 1, userInfo: [NSLocalizedDescriptionKey: "AppKit named pasteboard round trip failed"])
}
report["appKitPasteboardRoundTrip"] = true
try saveJSON(["format": "boardeject.clipboard", "version": 1,
              "flavors": [["uti": NSPasteboard.PasteboardType.string.rawValue, "base64": payload.base64EncodedString()]]], "appkit-capture.json")

#if canImport(PencilKit)
if #available(macOS 11.0, *) {
    let locations = [CGPoint(x: 0, y: 0), CGPoint(x: 30, y: 60), CGPoint(x: 60, y: 0), CGPoint(x: 90, y: 40)]
    let controls = locations.enumerated().map { index, point in
        PKStrokePoint(location: point, timeOffset: Double(index) * 0.1,
                      size: CGSize(width: 4, height: 4), opacity: 1,
                      force: 0.5, azimuth: 0, altitude: .pi / 2)
    }
    let path = PKStrokePath(controlPoints: controls, creationDate: Date(timeIntervalSince1970: 0))
    let transform = CGAffineTransform(a: 1, b: 0, c: 0, d: 1, tx: 100, ty: 50)
    let stroke = PKStroke(ink: PKInk(.pen, color: .black), path: path, transform: transform, mask: nil)
    let drawing = PKDrawing(strokes: [stroke])
    let bytes = drawing.dataRepresentation()
    try bytes.write(to: output.appendingPathComponent("native-pen.drawing"), options: .atomic)
    let decoded = try PKDrawing(data: bytes)
    guard decoded.strokes.count == 1 else { throw NSError(domain: "BoardEject", code: 2) }
    let samples = decoded.strokes[0].path.interpolatedPoints(by: .parametricStep(0.125)).map { point -> [String: Double] in
        let p = point.location.applying(decoded.strokes[0].transform)
        return ["x": Double(p.x), "y": Double(p.y), "width": Double(point.size.width), "force": Double(point.force)]
    }
    try saveJSON(["parametricStep": 0.125, "samples": samples,
                  "controls": locations.map { ["x": Double($0.x), "y": Double($0.y)] },
                  "transform": ["a": 1, "b": 0, "c": 0, "d": 1, "tx": 100, "ty": 50]], "pencilkit-reference.json")
    report["pencilKit"] = "passed: serialization, deserialization and native interpolation"
    report["sampleCount"] = samples.count

    // Decoder evidence only: these strokes are Apple-generated, not Freeform captures.
    // Keep binary payloads and native reference values together in experimental artifacts.
    let variableControls = (0..<7).map { index in
        PKStrokePoint(location: CGPoint(x: index * 20, y: 20),
                      timeOffset: Double(index) * 0.1,
                      size: CGSize(width: 2 + index * 2, height: 2 + index * 2),
                      opacity: 1, force: CGFloat(index + 1) / 8,
                      azimuth: 0, altitude: .pi / 2)
    }
    let variablePath = PKStrokePath(controlPoints: variableControls, creationDate: Date(timeIntervalSince1970: 0))
    let unmasked = PKStroke(ink: PKInk(.pen, color: .black), path: variablePath, transform: .identity, mask: nil)
    // Two retained rectangles leave a visible gap across the stroke centerline.
    // This is a constructed clipping mask, NOT evidence of Freeform eraser output.
    let mask = NSBezierPath(rect: CGRect(x: -20, y: -20, width: 65, height: 80))
    mask.append(NSBezierPath(rect: CGRect(x: 75, y: -20, width: 65, height: 80)))
    let masked = PKStroke(ink: unmasked.ink, path: variablePath, transform: .identity, mask: mask)
    for (name, candidate) in [("variable-width", unmasked), ("masked-gap", masked)] {
        let native = PKDrawing(strokes: [candidate])
        let data = native.dataRepresentation()
        try data.write(to: output.appendingPathComponent("\(name).drawing"), options: .atomic)
        let roundTrip = try PKDrawing(data: data)
        guard roundTrip.strokes.count == 1 else { throw NSError(domain: "BoardEject", code: 3) }
        let restored = roundTrip.strokes[0]
        let reference = restored.path.interpolatedPoints(by: .parametricStep(0.125)).map { point -> [String: Double] in
            ["x": Double(point.location.x), "y": Double(point.location.y),
             "width": Double(point.size.width), "height": Double(point.size.height),
             "force": Double(point.force)]
        }
        let ranges = restored.maskedPathRanges.map { [Double($0.lowerBound), Double($0.upperBound)] }
        guard Set(reference.map { $0["width"]! }).count > 1,
              Set(reference.map { $0["force"]! }).count > 1 else {
            throw NSError(domain: "BoardEject", code: 4, userInfo: [NSLocalizedDescriptionKey: "Native width/force variation did not survive serialization"])
        }
        if name == "masked-gap" && (restored.mask == nil || ranges.count < 2) {
            throw NSError(domain: "BoardEject", code: 5, userInfo: [NSLocalizedDescriptionKey: "Native separated mask ranges did not survive serialization"])
        }
        try saveJSON(["origin": "Apple PencilKit construction, not Freeform",
                      "freeformRoundTrip": false, "hasMask": restored.mask != nil,
                      "maskedPathRanges": ranges, "samples": reference], "\(name)-reference.json")
        let rendered = roundTrip.image(from: CGRect(x: -20, y: -20, width: 160, height: 80), scale: 2)
        if let tiff = rendered.tiffRepresentation,
           let bitmap = NSBitmapImageRep(data: tiff),
           let png = bitmap.representation(using: .png, properties: [:]) {
            try png.write(to: output.appendingPathComponent("\(name).png"), options: .atomic)
        }
    }
    report["widthAndMaskReference"] = "passed: Apple serialization; Freeform round trip unverified"
} else {
    report["pencilKit"] = "unavailable: macOS 11 or later is required for stroke inspection"
}
#else
report["pencilKit"] = "unavailable: framework cannot be imported by this SDK"
#endif
try saveJSON(report, "report.json")
print(String(data: try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
