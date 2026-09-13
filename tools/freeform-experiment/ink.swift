import AppKit
import PencilKit
import Foundation

let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let pb = NSPasteboard.general
func describe(_ drawing: PKDrawing, _ name: String) throws {
    let strokes = drawing.strokes.map { stroke -> [String: Any] in
        ["maskPresent": stroke.mask != nil, "samples": stroke.path.interpolatedPoints(by: .parametricStep(0.25)).map {
            ["x": Double($0.location.x), "y": Double($0.location.y), "width": Double($0.size.width), "force": Double($0.force)]
        }]
    }
    try JSONSerialization.data(withJSONObject: ["strokes": strokes], options: [.prettyPrinted, .sortedKeys]).write(to: output.appendingPathComponent(name + ".json"))
    let image = drawing.image(from: CGRect(x: 0, y: 0, width: 300, height: 140), scale: 2)
    if let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
        try png.write(to: output.appendingPathComponent(name + ".png"))
    }
}
if CommandLine.arguments.contains("--read") {
    guard let bytes = pb.data(forType: .init("com.apple.drawing")) else { print("No com.apple.drawing returned by Freeform"); exit(3) }
    try bytes.write(to: output.appendingPathComponent("returned.drawing"))
    try describe(PKDrawing(data: bytes), "returned")
} else {
    var points: [PKStrokePoint] = []
    for i in 0..<9 {
        let x = CGFloat(20 + i * 30)
        let width = CGFloat(3 + i * 2)
        let force = CGFloat(i + 1) / 10.0
        let point = PKStrokePoint(location: CGPoint(x: x, y: 70), timeOffset: Double(i) * 0.1,
                                  size: CGSize(width: width, height: width), opacity: 1,
                                  force: force, azimuth: 0, altitude: CGFloat.pi / 2)
        points.append(point)
    }
    let mask = NSBezierPath(rect: NSRect(x: 0, y: 0, width: 115, height: 140))
    mask.append(NSBezierPath(rect: NSRect(x: 165, y: 0, width: 135, height: 140)))
    let path = PKStrokePath(controlPoints: points, creationDate: Date(timeIntervalSince1970: 0))
    let drawing = PKDrawing(strokes: [PKStroke(ink: PKInk(.pen, color: .black), path: path, mask: mask)])
    let bytes = drawing.dataRepresentation()
    try bytes.write(to: output.appendingPathComponent("source.drawing"))
    try describe(PKDrawing(data: bytes), "source")
    pb.clearContents()
    guard pb.setData(bytes, forType: .init("com.apple.drawing")) else { exit(2) }
    print("Apple-generated variable-width masked PKDrawing placed on pasteboard; not yet a Freeform capture")
}
