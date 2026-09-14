import CryptoKit
import Foundation

private let snapshotFormat = "boardeject.native-snapshot"
private let snapshotVersion = 1

struct FileSignature: Codable, Equatable {
    let bytes: UInt64
    let modifiedNanoseconds: Int64
    let inode: UInt64
    let sha256: String
}

struct SnapshotFile: Codable {
    let role: String
    let sourceName: String
    let snapshotName: String
    let bytes: UInt64
    let sha256: String
}

struct SnapshotManifest: Codable {
    let format = snapshotFormat
    let version = snapshotVersion
    let files: [SnapshotFile]
}

enum SnapshotError: Error, CustomStringConvertible {
    case invalidSource(String)
    case destinationExists
    case sourceChanged
    case copyMismatch(String)

    var description: String {
        switch self {
        case .invalidSource(let message): message
        case .destinationExists: "Destination already exists. No files were modified."
        case .sourceChanged: "Freeform changed while the snapshot was being copied. No live files were modified."
        case .copyMismatch(let name): "Snapshot verification failed for \(name). No live files were modified."
        }
    }
}

func sha256(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hash = SHA256()
    while true {
        let data = try handle.read(upToCount: 1024 * 1024) ?? Data()
        if data.isEmpty { break }
        hash.update(data: data)
    }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
}

func signature(_ url: URL) throws -> FileSignature? {
    let manager = FileManager.default
    guard manager.fileExists(atPath: url.path) else { return nil }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    guard values.isRegularFile == true, values.isSymbolicLink != true else {
        throw SnapshotError.invalidSource("Snapshot sources must be regular files and cannot be symlinks.")
    }
    let attributes = try manager.attributesOfItem(atPath: url.path)
    guard let size = attributes[.size] as? NSNumber,
          let modified = attributes[.modificationDate] as? Date,
          let inode = attributes[.systemFileNumber] as? NSNumber else {
        throw SnapshotError.invalidSource("Could not inspect the Freeform source files.")
    }
    return FileSignature(
        bytes: size.uint64Value,
        modifiedNanoseconds: Int64(modified.timeIntervalSince1970 * 1_000_000_000),
        inode: inode.uint64Value,
        sha256: try sha256(url)
    )
}

func sourceSet(database: URL) -> [(role: String, source: URL, snapshotName: String)] {
    [
        ("database", database, "boards.db"),
        ("wal", URL(fileURLWithPath: database.path + "-wal"), "boards.db-wal"),
        ("shm", URL(fileURLWithPath: database.path + "-shm"), "boards.db-shm"),
    ]
}

func snapshot(database: URL, destination: URL) throws -> SnapshotManifest {
    let manager = FileManager.default
    guard !manager.fileExists(atPath: destination.path) else { throw SnapshotError.destinationExists }
    let parent = destination.deletingLastPathComponent()
    let staging = parent.appendingPathComponent(".boardeject-snapshot-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: staging, withIntermediateDirectories: false)
    var completed = false
    defer { if !completed { try? manager.removeItem(at: staging) } }

    let candidates = sourceSet(database: database)
    let before = try candidates.map { try signature($0.source) }
    guard before[0] != nil else {
        throw SnapshotError.invalidSource("Freeform database is unavailable. No files were modified.")
    }
    var records: [SnapshotFile] = []
    for (index, candidate) in candidates.enumerated() where before[index] != nil {
        let target = staging.appendingPathComponent(candidate.snapshotName)
        try manager.copyItem(at: candidate.source, to: target)
        guard let copied = try signature(target), copied.sha256 == before[index]?.sha256,
              copied.bytes == before[index]?.bytes else {
            throw SnapshotError.copyMismatch(candidate.source.lastPathComponent)
        }
        records.append(SnapshotFile(
            role: candidate.role,
            sourceName: candidate.source.lastPathComponent,
            snapshotName: candidate.snapshotName,
            bytes: copied.bytes,
            sha256: copied.sha256
        ))
    }
    let after = try candidates.map { try signature($0.source) }
    guard before == after else { throw SnapshotError.sourceChanged }

    let manifest = SnapshotManifest(files: records)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
    try encoder.encode(manifest).write(
        to: staging.appendingPathComponent("snapshot.json"),
        options: .withoutOverwriting
    )
    try manager.moveItem(at: staging, to: destination)
    completed = true
    return manifest
}

func usage() -> Never {
    FileHandle.standardError.write(Data("Usage: boardeject-archive-helper snapshot /path/to/boards.db /path/to/snapshot-directory\nCopies DB/WAL/SHM after byte-level stability checks. It never opens or writes the live database.\n".utf8))
    exit(2)
}

guard CommandLine.arguments.count == 4, CommandLine.arguments[1] == "snapshot" else { usage() }
do {
    let database = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
    let destination = URL(fileURLWithPath: CommandLine.arguments[3]).standardizedFileURL
    let result = try snapshot(database: database, destination: destination)
    FileHandle.standardOutput.write(Data("Snapshot complete: \(result.files.count) files copied and verified. No live files were modified.\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Snapshot failed: \(error)\n".utf8))
    exit(1)
}
