import CryptoKit
import Foundation
import SQLite3

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

private let verifiedSchemaVersion: Int32 = 16
private let verifiedSchemaFingerprint = "921b22ba14261263cf75237435f6667dde9620a8a3cbd4c651a8a28021ecf433"

struct BoardSummary: Codable {
    let id: String
    let displayName: String
    let titleStatus = "unverified"
    let modifiedAt: Double?
    let objectCount: Int
    let assetReferenceCount: Int
}

struct CatalogReport: Codable {
    let format = "boardeject.freeform-catalog"
    let version = 1
    let databaseUserVersion: Int32
    let schemaFingerprint: String
    let schemaStatus: String
    let boards: [BoardSummary]
    let warnings: [String]
}

enum CatalogError: Error, CustomStringConvertible {
    case invalidSnapshot(String)
    case sqlite(String)
    case unsupportedSchema(Int32, String)

    var description: String {
        switch self {
        case .invalidSnapshot(let message): message
        case .sqlite(let message): "Copied Freeform database could not be read: \(message)"
        case .unsupportedSchema:
            "Unsupported Freeform database version. No files were modified."
        }
    }
}

func sqliteMessage(_ database: OpaquePointer?) -> String {
    guard let database, let message = sqlite3_errmsg(database) else { return "unknown SQLite error" }
    return String(cString: message)
}

func queryRows(
    _ database: OpaquePointer?,
    sql: String,
    row: (OpaquePointer) throws -> Void
) throws {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
          let statement else { throw CatalogError.sqlite(sqliteMessage(database)) }
    defer { sqlite3_finalize(statement) }
    while true {
        let result = sqlite3_step(statement)
        if result == SQLITE_DONE { return }
        guard result == SQLITE_ROW else { throw CatalogError.sqlite(sqliteMessage(database)) }
        try row(statement)
    }
}

func scalarInt(_ database: OpaquePointer?, sql: String) throws -> Int32 {
    var value: Int32?
    try queryRows(database, sql: sql) { statement in value = sqlite3_column_int(statement, 0) }
    guard let value else { throw CatalogError.sqlite("query returned no value") }
    return value
}

func textColumn(_ statement: OpaquePointer, _ index: Int32) -> String {
    guard let value = sqlite3_column_text(statement, index) else { return "" }
    return String(cString: value)
}

func schemaFingerprint(_ database: OpaquePointer?) throws -> String {
    var schema: [[String: String]] = []
    try queryRows(
        database,
        sql: "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
    ) { statement in
        schema.append([
            "type": textColumn(statement, 0),
            "name": textColumn(statement, 1),
            "table": textColumn(statement, 2),
            "sql": textColumn(statement, 3),
        ])
    }
    let bytes = try JSONSerialization.data(withJSONObject: schema, options: [.sortedKeys, .withoutEscapingSlashes])
    return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
}

func uuidText(_ statement: OpaquePointer, _ index: Int32) throws -> String {
    guard sqlite3_column_bytes(statement, index) == 16,
          let source = sqlite3_column_blob(statement, index) else {
        throw CatalogError.sqlite("board identifier is not a 16-byte UUID")
    }
    let bytes = source.assumingMemoryBound(to: UInt8.self)
    let hex = (0..<16).map { String(format: "%02x", bytes[$0]) }
    return [
        hex[0...3].joined(), hex[4...5].joined(), hex[6...7].joined(),
        hex[8...9].joined(), hex[10...15].joined(),
    ].joined(separator: "-")
}

func catalog(snapshot: URL) throws -> CatalogReport {
    let manager = FileManager.default
    let databaseURL = snapshot.appendingPathComponent("boards.db")
    guard manager.fileExists(atPath: snapshot.appendingPathComponent("snapshot.json").path),
          manager.fileExists(atPath: databaseURL.path) else {
        throw CatalogError.invalidSnapshot("A verified BoardEject native snapshot is required.")
    }
    var database: OpaquePointer?
    let openResult = sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil)
    guard openResult == SQLITE_OK else {
        defer { if database != nil { sqlite3_close(database) } }
        throw CatalogError.sqlite(sqliteMessage(database))
    }
    defer { sqlite3_close(database) }
    guard sqlite3_exec(database, "PRAGMA query_only=ON", nil, nil, nil) == SQLITE_OK else {
        throw CatalogError.sqlite(sqliteMessage(database))
    }
    let userVersion = try scalarInt(database, sql: "PRAGMA user_version")
    let fingerprint = try schemaFingerprint(database)
    guard userVersion == verifiedSchemaVersion, fingerprint == verifiedSchemaFingerprint else {
        throw CatalogError.unsupportedSchema(userVersion, fingerprint)
    }
    var boards: [BoardSummary] = []
    try queryRows(
        database,
        sql: """
        SELECT b.board_identifier,b.last_activity_time,
          (SELECT count(*) FROM board_items i
           WHERE i.board_identifier=b.board_identifier AND i.tombstoned=0),
          (SELECT count(*) FROM asset_references a JOIN board_items i
           ON i.item_uuid=a.referrer_identifier AND i.board_identifier=a.board_identifier
           WHERE a.board_identifier=b.board_identifier AND i.tombstoned=0)
        FROM boards b
        WHERE b.tombstoned=0 AND b.is_discardable=0
        ORDER BY b.last_activity_time DESC,b.board_identifier
        """
    ) { statement in
        let id = try uuidText(statement, 0)
        boards.append(BoardSummary(
            id: id,
            displayName: "Untitled \(id.prefix(8))",
            modifiedAt: sqlite3_column_type(statement, 1) == SQLITE_NULL
                ? nil : sqlite3_column_double(statement, 1),
            objectCount: Int(sqlite3_column_int64(statement, 2)),
            assetReferenceCount: Int(sqlite3_column_int64(statement, 3))
        ))
    }
    return CatalogReport(
        databaseUserVersion: userVersion,
        schemaFingerprint: fingerprint,
        schemaStatus: "verified",
        boards: boards,
        warnings: ["Freeform board-title decoding is not yet verified; select boards by native UUID."]
    )
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
    FileHandle.standardError.write(Data("Usage:\n  boardeject-archive-helper snapshot /path/to/boards.db /path/to/snapshot-directory\n  boardeject-archive-helper catalog /path/to/snapshot-directory\nThe helper never opens or writes the live database. Catalog reads only a verified copied schema.\n".utf8))
    exit(2)
}

do {
    guard CommandLine.arguments.count >= 3 else { usage() }
    if CommandLine.arguments[1] == "snapshot", CommandLine.arguments.count == 4 {
        let database = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
        let destination = URL(fileURLWithPath: CommandLine.arguments[3]).standardizedFileURL
        let result = try snapshot(database: database, destination: destination)
        FileHandle.standardOutput.write(Data("Snapshot complete: \(result.files.count) files copied and verified. No live files were modified.\n".utf8))
    } else if CommandLine.arguments[1] == "catalog", CommandLine.arguments.count == 3 {
        let snapshotURL = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
        FileHandle.standardOutput.write(try encoder.encode(catalog(snapshot: snapshotURL)))
        FileHandle.standardOutput.write(Data("\n".utf8))
    } else {
        usage()
    }
} catch {
    FileHandle.standardError.write(Data("BoardEject archive helper failed: \(error)\n".utf8))
    exit(1)
}
