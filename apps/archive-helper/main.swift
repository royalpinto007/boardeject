import CryptoKit
import Foundation
import SQLite3

private let snapshotFormat = "boardeject.native-snapshot"
private let snapshotVersion = 1
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

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

struct NativeValue: Codable {
    let type: String
    let value: String?
}

struct NativeTable: Codable {
    let name: String
    let columns: [String]
    let rows: [[NativeValue]]
}

struct NativeBoardRecords: Codable {
    let format = "boardeject.native-board-records"
    let version = 1
    let boardId: String
    let databaseUserVersion: Int32
    let schemaFingerprint: String
    let tables: [NativeTable]
}

struct PreservedAsset: Codable {
    let nativeId: String
    let extensionValue: String?
    let roles: [String]
    let objectIds: [String]
    let bytes: UInt64?
    let sha256: String?
    let file: String?
    let status: String

    enum CodingKeys: String, CodingKey {
        case nativeId
        case extensionValue = "extension"
        case roles, objectIds, bytes, sha256, file, status
    }
}

struct AssetPreservationReport: Codable {
    let format = "boardeject.preserved-assets"
    let version = 1
    let boardId: String
    let assets: [PreservedAsset]
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

func preparedRows(
    _ database: OpaquePointer?,
    sql: String,
    boardIdentifier: Data,
    row: (OpaquePointer) throws -> Void
) throws {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
          let statement else { throw CatalogError.sqlite(sqliteMessage(database)) }
    defer { sqlite3_finalize(statement) }
    let bindResult = boardIdentifier.withUnsafeBytes { bytes in
        sqlite3_bind_blob(statement, 1, bytes.baseAddress, Int32(bytes.count), SQLITE_TRANSIENT)
    }
    guard bindResult == SQLITE_OK else { throw CatalogError.sqlite(sqliteMessage(database)) }
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

func uuidData(_ value: String) throws -> Data {
    let compact = value.replacingOccurrences(of: "-", with: "").lowercased()
    guard compact.count == 32 else { throw CatalogError.invalidSnapshot("Board UUID is invalid.") }
    var data = Data(capacity: 16)
    var index = compact.startIndex
    for _ in 0..<16 {
        let next = compact.index(index, offsetBy: 2)
        guard let byte = UInt8(compact[index..<next], radix: 16) else {
            throw CatalogError.invalidSnapshot("Board UUID is invalid.")
        }
        data.append(byte)
        index = next
    }
    return data
}

func openVerifiedSnapshot<T>(snapshot: URL, body: (OpaquePointer, Int32, String) throws -> T) throws -> T {
    let manager = FileManager.default
    let databaseURL = snapshot.appendingPathComponent("boards.db")
    guard manager.fileExists(atPath: snapshot.appendingPathComponent("snapshot.json").path),
          manager.fileExists(atPath: databaseURL.path) else {
        throw CatalogError.invalidSnapshot("A verified BoardEject native snapshot is required.")
    }
    var database: OpaquePointer?
    let openResult = sqlite3_open_v2(databaseURL.path, &database, SQLITE_OPEN_READONLY, nil)
    guard openResult == SQLITE_OK, let database else {
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
    return try body(database, userVersion, fingerprint)
}

func catalog(snapshot: URL) throws -> CatalogReport {
    try openVerifiedSnapshot(snapshot: snapshot) { database, userVersion, fingerprint in
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
}

func nativeValue(_ statement: OpaquePointer, _ index: Int32) throws -> NativeValue {
    switch sqlite3_column_type(statement, index) {
    case SQLITE_NULL: return NativeValue(type: "null", value: nil)
    case SQLITE_INTEGER:
        return NativeValue(type: "integer", value: String(sqlite3_column_int64(statement, index)))
    case SQLITE_FLOAT:
        return NativeValue(type: "real", value: String(sqlite3_column_double(statement, index)))
    case SQLITE_TEXT:
        return NativeValue(type: "text", value: textColumn(statement, index))
    case SQLITE_BLOB:
        let count = Int(sqlite3_column_bytes(statement, index))
        guard count == 0 || sqlite3_column_blob(statement, index) != nil else {
            throw CatalogError.sqlite("invalid blob column")
        }
        let data = count == 0
            ? Data()
            : Data(bytes: sqlite3_column_blob(statement, index)!, count: count)
        return NativeValue(type: "blob", value: data.base64EncodedString())
    default: throw CatalogError.sqlite("unsupported SQLite value type")
    }
}

func extractTable(
    _ database: OpaquePointer,
    name: String,
    sql: String,
    boardIdentifier: Data
) throws -> NativeTable {
    var columns: [String] = []
    var rows: [[NativeValue]] = []
    try preparedRows(database, sql: sql, boardIdentifier: boardIdentifier) { statement in
        if columns.isEmpty {
            columns = (0..<sqlite3_column_count(statement)).map { index in
                String(cString: sqlite3_column_name(statement, index))
            }
        }
        rows.append(try (0..<sqlite3_column_count(statement)).map {
            try nativeValue(statement, $0)
        })
    }
    if columns.isEmpty {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement else { throw CatalogError.sqlite(sqliteMessage(database)) }
        defer { sqlite3_finalize(statement) }
        columns = (0..<sqlite3_column_count(statement)).map { index in
            String(cString: sqlite3_column_name(statement, index))
        }
    }
    return NativeTable(name: name, columns: columns, rows: rows)
}

func extractBoard(snapshot: URL, boardId: String) throws -> NativeBoardRecords {
    let identifier = try uuidData(boardId)
    return try openVerifiedSnapshot(snapshot: snapshot) { database, userVersion, fingerprint in
        guard try scalarInt(
            database,
            sql: "SELECT count(*) FROM boards WHERE lower(hex(board_identifier))='\(identifier.map { String(format: "%02x", $0) }.joined())' AND tombstoned=0 AND is_discardable=0"
        ) == 1 else { throw CatalogError.invalidSnapshot("Selected board was not found.") }
        let definitions: [(String, String)] = [
            ("boards", "SELECT * FROM boards WHERE board_identifier=? ORDER BY board_identifier"),
            ("boards_metadata", "SELECT * FROM boards_metadata WHERE board_identifier=? ORDER BY board_identifier"),
            ("board_items", "SELECT * FROM board_items WHERE board_identifier=? ORDER BY item_uuid"),
            ("asset_references", "SELECT * FROM asset_references WHERE board_identifier=? ORDER BY referrer_identifier,referrer_asset_name,asset_uuid"),
            ("freehand_drawing_buckets", "SELECT * FROM freehand_drawing_buckets WHERE board_indentifier=? ORDER BY bucket_index"),
            ("command_history_items", "SELECT * FROM command_history_items WHERE board_identifier=? ORDER BY item_id"),
            ("command_history_asset_references", "SELECT r.* FROM command_history_asset_references r JOIN command_history_items h ON h.item_id=r.command_history_item_id WHERE h.board_identifier=? ORDER BY r.command_history_item_id,r.asset_uuid"),
            ("assets", "SELECT a.* FROM assets a WHERE a.asset_uuid IN (SELECT asset_uuid FROM asset_references WHERE board_identifier=? UNION SELECT r.asset_uuid FROM command_history_asset_references r JOIN command_history_items h ON h.item_id=r.command_history_item_id WHERE h.board_identifier=?) ORDER BY a.asset_uuid"),
        ]
        var tables: [NativeTable] = []
        for (name, sql) in definitions {
            if name == "assets" {
                var statement: OpaquePointer?
                guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
                      let statement else { throw CatalogError.sqlite(sqliteMessage(database)) }
                defer { sqlite3_finalize(statement) }
                for index in 1...2 {
                    let result = identifier.withUnsafeBytes { bytes in
                        sqlite3_bind_blob(statement, Int32(index), bytes.baseAddress, Int32(bytes.count), SQLITE_TRANSIENT)
                    }
                    guard result == SQLITE_OK else { throw CatalogError.sqlite(sqliteMessage(database)) }
                }
                var columns: [String] = []
                var rows: [[NativeValue]] = []
                while sqlite3_step(statement) == SQLITE_ROW {
                    if columns.isEmpty {
                        columns = (0..<sqlite3_column_count(statement)).map { String(cString: sqlite3_column_name(statement, $0)) }
                    }
                    rows.append(try (0..<sqlite3_column_count(statement)).map { try nativeValue(statement, $0) })
                }
                if columns.isEmpty {
                    columns = (0..<sqlite3_column_count(statement)).map { String(cString: sqlite3_column_name(statement, $0)) }
                }
                tables.append(NativeTable(name: name, columns: columns, rows: rows))
            } else {
                tables.append(try extractTable(database, name: name, sql: sql, boardIdentifier: identifier))
            }
        }
        return NativeBoardRecords(
            boardId: boardId.lowercased(),
            databaseUserVersion: userVersion,
            schemaFingerprint: fingerprint,
            tables: tables
        )
    }
}

func preserveAssets(snapshot: URL, boardId: String, assetsRoot: URL, destination: URL) throws -> AssetPreservationReport {
    let manager = FileManager.default
    guard !manager.fileExists(atPath: destination.path) else {
        throw CatalogError.invalidSnapshot("Asset destination already exists.")
    }
    let rootValues = try assetsRoot.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
    guard rootValues.isDirectory == true, rootValues.isSymbolicLink != true else {
        throw CatalogError.invalidSnapshot("Freeform Assets directory is unavailable or unsafe.")
    }
    let identifier = try uuidData(boardId)
    let staging = destination.deletingLastPathComponent()
        .appendingPathComponent(".boardeject-assets-\(UUID().uuidString)", isDirectory: true)
    try manager.createDirectory(at: staging, withIntermediateDirectories: false)
    var completed = false
    defer { if !completed { try? manager.removeItem(at: staging) } }
    let filesDirectory = staging.appendingPathComponent("files", isDirectory: true)
    try manager.createDirectory(at: filesDirectory, withIntermediateDirectories: false)

    let report = try openVerifiedSnapshot(snapshot: snapshot) { database, _, _ in
        struct Reference {
            var extensionValue: String?
            var roles = Set<String>()
            var objectIds = Set<String>()
        }
        var references: [String: Reference] = [:]
        try preparedRows(
            database,
            sql: """
            SELECT a.asset_uuid,a.extension,r.referrer_asset_name,r.referrer_identifier
            FROM asset_references r
            LEFT JOIN assets a ON a.asset_uuid=r.asset_uuid
            WHERE r.board_identifier=?
            ORDER BY a.asset_uuid,r.referrer_asset_name,r.referrer_identifier
            """,
            boardIdentifier: identifier
        ) { statement in
            let nativeId = try uuidText(statement, 0)
            var reference = references[nativeId] ?? Reference()
            let extensionText = textColumn(statement, 1).lowercased()
            reference.extensionValue = extensionText.isEmpty ? nil : extensionText
            reference.roles.insert(textColumn(statement, 2))
            reference.objectIds.insert(try uuidText(statement, 3))
            references[nativeId] = reference
        }
        var assets: [PreservedAsset] = []
        var canonicalByHash: [String: String] = [:]
        for nativeId in references.keys.sorted() {
            let reference = references[nativeId]!
            if let extensionValue = reference.extensionValue,
               extensionValue.isEmpty || extensionValue.count > 12 ||
               !extensionValue.utf8.allSatisfy({ byte in
                   (48...57).contains(byte) || (97...122).contains(byte)
               }) {
                throw CatalogError.invalidSnapshot("Freeform asset extension is unsafe.")
            }
            let suffix = reference.extensionValue.map { ".\($0)" } ?? ""
            let source = assetsRoot.appendingPathComponent(nativeId.uppercased() + suffix)
            guard let before = try signature(source) else {
                assets.append(PreservedAsset(
                    nativeId: nativeId,
                    extensionValue: reference.extensionValue,
                    roles: reference.roles.sorted(),
                    objectIds: reference.objectIds.sorted(),
                    bytes: nil, sha256: nil, file: nil, status: "missing"
                ))
                continue
            }
            let duplicate = canonicalByHash[before.sha256] != nil
            let canonicalName = canonicalByHash[before.sha256]
                ?? before.sha256 + (reference.extensionValue.map { ".\($0)" } ?? ".bin")
            if canonicalByHash[before.sha256] == nil {
                let target = filesDirectory.appendingPathComponent(canonicalName)
                try manager.copyItem(at: source, to: target)
                guard let copied = try signature(target), copied.bytes == before.bytes,
                      copied.sha256 == before.sha256, try signature(source) == before else {
                    throw SnapshotError.copyMismatch(source.lastPathComponent)
                }
                canonicalByHash[before.sha256] = canonicalName
            }
            assets.append(PreservedAsset(
                nativeId: nativeId,
                extensionValue: reference.extensionValue,
                roles: reference.roles.sorted(),
                objectIds: reference.objectIds.sorted(),
                bytes: before.bytes,
                sha256: before.sha256,
                file: "files/\(canonicalName)",
                status: duplicate ? "duplicate" : "preserved"
            ))
        }
        let missing = assets.filter { $0.status == "missing" }.count
        return AssetPreservationReport(
            boardId: boardId.lowercased(),
            assets: assets,
            warnings: missing == 0 ? [] : ["\(missing) referenced asset(s) were missing."]
        )
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
    try encoder.encode(report).write(
        to: staging.appendingPathComponent("assets.json"),
        options: .withoutOverwriting
    )
    try manager.moveItem(at: staging, to: destination)
    completed = true
    return report
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
    FileHandle.standardError.write(Data("Usage:\n  boardeject-archive-helper snapshot /path/to/boards.db /path/to/snapshot-directory\n  boardeject-archive-helper catalog /path/to/snapshot-directory\n  boardeject-archive-helper extract /path/to/snapshot-directory BOARD-UUID /path/to/native-records.json\n  boardeject-archive-helper assets /path/to/snapshot-directory BOARD-UUID /path/to/Freeform/Assets /path/to/new-assets-directory\nThe helper never opens or writes the live database. Read commands accept only a verified copied schema.\n".utf8))
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
    } else if CommandLine.arguments[1] == "extract", CommandLine.arguments.count == 5 {
        let snapshotURL = URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL
        let destination = URL(fileURLWithPath: CommandLine.arguments[4]).standardizedFileURL
        guard !FileManager.default.fileExists(atPath: destination.path) else {
            throw CatalogError.invalidSnapshot("Extraction destination already exists.")
        }
        let records = try extractBoard(
            snapshot: snapshotURL,
            boardId: CommandLine.arguments[3]
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .prettyPrinted, .withoutEscapingSlashes]
        try encoder.encode(records).write(to: destination, options: .withoutOverwriting)
        FileHandle.standardOutput.write(Data("Selected board records extracted without modifying Freeform.\n".utf8))
    } else if CommandLine.arguments[1] == "assets", CommandLine.arguments.count == 6 {
        let report = try preserveAssets(
            snapshot: URL(fileURLWithPath: CommandLine.arguments[2]).standardizedFileURL,
            boardId: CommandLine.arguments[3],
            assetsRoot: URL(fileURLWithPath: CommandLine.arguments[4]).standardizedFileURL,
            destination: URL(fileURLWithPath: CommandLine.arguments[5]).standardizedFileURL
        )
        FileHandle.standardOutput.write(Data("Assets preserved: \(report.assets.filter { $0.status != "missing" }.count); missing: \(report.assets.filter { $0.status == "missing" }.count).\n".utf8))
    } else {
        usage()
    }
} catch {
    FileHandle.standardError.write(Data("BoardEject archive helper failed: \(error)\n".utf8))
    exit(1)
}
