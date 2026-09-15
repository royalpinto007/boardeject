import { execFile } from "node:child_process";
import {
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verifyArchive } from "../packages/archive/index.ts";
import { isSafeArchivePath } from "../packages/archive/index.ts";
import { assembleNativeArchive } from "../packages/archive/assemble.ts";

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Catalog {
  format: "boardeject.freeform-catalog";
  boards: Array<{
    id: string;
    displayName: string;
    titleStatus: "verified" | "unverified";
    modifiedAt?: number;
    objectCount: number;
    assetReferenceCount: number;
  }>;
  warnings: string[];
}

function usage(): never {
  console.error(`Usage:
  boardeject-mac scan
  boardeject-mac create BOARD_UUID OUTPUT.boardejectarchive [--title DISPLAY_TITLE]
  boardeject-mac verify INPUT.boardejectarchive

The helper reads Freeform only long enough to create a stable private snapshot.
All database queries and archive assembly operate on that copy.`);
  process.exit(2);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

function nativePaths() {
  const group = join(
    homedir(),
    "Library/Group Containers/group.com.apple.freeform",
  );
  return {
    database:
      process.env.BOARDEJECT_FREEFORM_DATABASE ??
      join(group, "Boards/boards.db"),
    assets:
      process.env.BOARDEJECT_FREEFORM_ASSETS ?? join(group, "Boards/Assets"),
  };
}

async function helper(work: string) {
  if (process.platform !== "darwin")
    throw new Error("Scanning Freeform requires macOS and Freeform.app.");
  const packaged = process.env.BOARDEJECT_ARCHIVE_HELPER;
  if (packaged) return realpath(packaged);
  const adjacent = join(dirname(process.execPath), "boardeject-archive-native");
  try {
    return await realpath(adjacent);
  } catch {
    // Source checkouts compile the helper below. Packaged downloads ship it.
  }
  const output = join(work, "boardeject-archive-native");
  await run("swiftc", [
    join(repository, "apps/archive-helper/main.swift"),
    "-lsqlite3",
    "-o",
    output,
  ]);
  return output;
}

async function preservedAssetFiles(root: string, manifestBytes: Uint8Array) {
  const parsed = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
    assets?: { file?: string }[];
  };
  const rootReal = await realpath(root);
  const files: Record<string, Uint8Array> = {};
  for (const asset of parsed.assets ?? []) {
    if (!asset.file) continue;
    if (!isSafeArchivePath(asset.file))
      throw new Error(`Unsafe preserved asset path: ${asset.file}`);
    const source = resolve(root, asset.file);
    const sourceReal = await realpath(source);
    const within = relative(rootReal, sourceReal);
    if (within.startsWith("..") || resolve(rootReal, within) !== sourceReal)
      throw new Error(`Preserved asset escaped its root: ${asset.file}`);
    if ((await lstat(source)).isSymbolicLink())
      throw new Error(`Preserved asset cannot be a symlink: ${asset.file}`);
    files[asset.file] = await readFile(source);
  }
  return files;
}

async function snapshot(work: string) {
  const executable = await helper(work);
  const paths = nativePaths();
  const destination = join(work, "snapshot");
  await run(executable, [
    "snapshot",
    await realpath(paths.database),
    destination,
  ]);
  const { stdout } = await run(executable, ["catalog", destination]);
  const catalog = JSON.parse(stdout) as Catalog;
  if (catalog.format !== "boardeject.freeform-catalog")
    throw new Error("Freeform catalogue is unsupported.");
  return { executable, destination, paths, catalog };
}

async function withSnapshot<T>(
  body: (context: Awaited<ReturnType<typeof snapshot>>) => Promise<T>,
) {
  const work = await mkdtemp(join(tmpdir(), "boardeject-archive-"));
  try {
    return await body(await snapshot(work));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function scanFreeformBoards() {
  return withSnapshot(async ({ catalog }) => catalog);
}

export async function createFreeformArchive(
  boardId: string,
  title?: string,
): Promise<Uint8Array> {
  return withSnapshot(async ({ executable, destination, paths, catalog }) => {
    const board = catalog.boards.find(
      (candidate) => candidate.id.toLowerCase() === boardId.toLowerCase(),
    );
    if (!board) throw new Error("Selected board UUID was not found.");
    const work = dirname(destination);
    const records = join(work, "native-records.json");
    const assets = join(work, "assets");
    await run(executable, ["extract", destination, board.id, records]);
    await run(executable, [
      "assets",
      destination,
      board.id,
      await realpath(paths.assets),
      assets,
    ]);
    const nativeRecords = await readFile(records);
    const assetManifest = await readFile(join(assets, "assets.json"));
    const bytes = await assembleNativeArchive({
      createdAt:
        process.env.BOARDEJECT_ARCHIVE_TIME ?? new Date().toISOString(),
      displayTitle: title ?? board.displayName,
      titleStatus: board.titleStatus,
      nativeRecords,
      assetManifest,
      assetFiles: await preservedAssetFiles(assets, assetManifest),
    });
    const report = await verifyArchive(bytes);
    if (!report.valid) throw new Error(report.errors.join("; "));
    return bytes;
  });
}

export async function verifyFreeformArchive(bytes: Uint8Array) {
  return verifyArchive(bytes);
}

async function scan() {
  console.log(JSON.stringify(await scanFreeformBoards(), null, 2));
}

async function create(args: string[]) {
  if (args.length < 2) usage();
  const [boardId, outputPath] = args;
  const title = option(args.slice(2), "--title");
  const allowed = new Set(["--title"]);
  for (let index = 2; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1]) usage();
  }
  const output = resolve(outputPath);
  if (!output.endsWith(".boardejectarchive"))
    throw new Error("Archive output must use the .boardejectarchive extension.");
  const outputParent = await realpath(dirname(output));
  if (resolve(outputParent, relative(outputParent, output)) !== output)
    throw new Error("Archive output path is unsafe.");
  const bytes = await createFreeformArchive(boardId, title);
  await writeFile(output, bytes, { flag: "wx" });
  const report = await verifyFreeformArchive(bytes);
  console.log(
    JSON.stringify(
      {
        archive: output,
        boardId: report.manifest?.board.id,
        filesChecked: report.filesChecked,
        assetsVerified: report.assetsVerified,
        missing: report.missing,
        excalidrawExport: report.manifest?.excalidrawExport.available ?? false,
      },
      null,
      2,
    ),
  );
}

async function verify(path: string) {
  const report = await verifyFreeformArchive(
    await readFile(await realpath(path)),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "scan" && args.length === 0) await scan();
  else if (command === "create") await create(args);
  else if (command === "verify" && args.length === 1) await verify(args[0]);
  else usage();
}
