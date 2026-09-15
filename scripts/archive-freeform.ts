import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { verifyArchive } from "../packages/archive/index.ts";

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Catalog {
  format: "boardeject.freeform-catalog";
  boards: Array<{
    id: string;
    displayName: string;
    titleStatus: "unverified";
    modifiedAt?: number;
    objectCount: number;
    assetReferenceCount: number;
  }>;
  warnings: string[];
}

function usage(): never {
  console.error(`Usage:
  npm run archive:freeform -- scan
  npm run archive:freeform -- create BOARD_UUID OUTPUT.boardejectarchive [--title DISPLAY_TITLE]
  npm run archive:freeform -- verify INPUT.boardejectarchive

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
  const output = join(work, "boardeject-archive-helper");
  await run("swiftc", [
    join(repository, "apps/archive-helper/main.swift"),
    "-lsqlite3",
    "-o",
    output,
  ]);
  return output;
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

async function scan() {
  await withSnapshot(async ({ catalog }) => {
    console.log(JSON.stringify(catalog, null, 2));
  });
}

async function create(args: string[]) {
  if (args.length < 2) usage();
  const [boardId, outputPath] = args;
  const title = option(args.slice(2), "--title");
  const allowed = new Set(["--title"]);
  for (let index = 2; index < args.length; index += 2) {
    if (!allowed.has(args[index]) || !args[index + 1]) usage();
  }
  await withSnapshot(async ({ executable, destination, paths, catalog }) => {
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
    const command = [
      "--experimental-strip-types",
      join(repository, "scripts/archive-cli.ts"),
      "create",
      records,
      assets,
      resolve(outputPath),
      title ?? board.displayName,
    ];
    const { stdout } = await run(process.execPath, command, {
      env: {
        ...process.env,
        BOARDEJECT_TITLE_STATUS: board.titleStatus,
      },
    });
    console.log(stdout.trim());
  });
}

async function verify(path: string) {
  const report = await verifyArchive(await readFile(await realpath(path)));
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

const [command, ...args] = process.argv.slice(2);
if (command === "scan" && args.length === 0) await scan();
else if (command === "create") await create(args);
else if (command === "verify" && args.length === 1) await verify(args[0]);
else usage();
