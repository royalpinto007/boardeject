import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { assembleNativeArchive } from "../packages/archive/assemble";
import { isSafeArchivePath, verifyArchive } from "../packages/archive/index";

function usage(): never {
  console.error(`Usage:
  node --experimental-strip-types scripts/archive-cli.ts create RECORDS_JSON ASSETS_DIRECTORY OUTPUT.boardejectarchive [DISPLAY_TITLE] [EXCALIDRAW_JSON]
  node --experimental-strip-types scripts/archive-cli.ts verify INPUT.boardejectarchive`);
  process.exit(2);
}

async function assetFiles(root: string, manifestBytes: Uint8Array) {
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

async function create(args: string[]) {
  if (args.length < 3 || args.length > 5) usage();
  const [
    recordsPath,
    assetsDirectory,
    outputPath,
    displayTitle,
    excalidrawPath,
  ] = args;
  if (!outputPath.endsWith(".boardejectarchive"))
    throw new Error(
      "Archive output must use the .boardejectarchive extension.",
    );
  const output = resolve(outputPath);
  const outputParent = await realpath(dirname(output));
  if (resolve(outputParent, relative(outputParent, output)) !== output)
    throw new Error("Archive output path is unsafe.");
  const nativeRecords = await readFile(recordsPath);
  const assetManifest = await readFile(join(assetsDirectory, "assets.json"));
  const excalidraw = excalidrawPath
    ? JSON.parse(await readFile(excalidrawPath, "utf8"))
    : undefined;
  const bytes = await assembleNativeArchive({
    createdAt: process.env.BOARDEJECT_ARCHIVE_TIME ?? new Date().toISOString(),
    displayTitle: displayTitle || "Untitled board",
    titleStatus: "unverified",
    nativeRecords,
    assetManifest,
    assetFiles: await assetFiles(assetsDirectory, assetManifest),
    excalidraw,
  });
  await writeFile(output, bytes, { flag: "wx" });
  const report = await verifyArchive(bytes);
  if (!report.valid) throw new Error(report.errors.join("; "));
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
  const report = await verifyArchive(await readFile(path));
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

const [command, ...args] = process.argv.slice(2);
if (command === "create") await create(args);
else if (command === "verify" && args.length === 1) await verify(args[0]);
else usage();
