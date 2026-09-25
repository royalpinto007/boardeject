// Synthetic UI boundary fixtures, not evidence of additional Freeform support.
import { mkdir, writeFile } from "node:fs/promises";
import { createArchive } from "../packages/archive/index.ts";
import { strToU8, unzipSync, zipSync } from "fflate";

const dir = "test-results/explorer";
await mkdir(dir, { recursive: true });
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  ),
);
const bytes = await createArchive({
  createdAt: "2026-09-25T12:00:00Z",
  board: { id: "ui-fixture", title: "Explorer UI test", objectCount: 1 },
  source: {
    kind: "freeform-snapshot",
    schemaStatus: "verified",
    databaseUserVersion: 16,
    schemaFingerprint: "synthetic-ui-test-only",
  },
  nativeFiles: { "native-records.json": strToU8("{}") },
  objects: [{ id: "object" }],
  assets: [
    {
      nativeId: "image",
      objectIds: ["object"],
      originalFilename: "image.png",
      bytes: png,
    },
    {
      nativeId: "notes",
      objectIds: ["object"],
      originalFilename: "notes.txt",
      bytes: strToU8("original bytes"),
    },
    {
      nativeId: "missing",
      objectIds: ["object"],
      originalFilename: "missing.pdf",
    },
    {
      nativeId: "html",
      objectIds: ["object"],
      originalFilename: "active.html",
      bytes: strToU8('<img src="https://example.invalid/leak">'),
    },
    {
      nativeId: "svg",
      objectIds: ["object"],
      originalFilename: "active.svg",
      bytes: strToU8(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/leak"/></svg>',
      ),
    },
  ],
});
await writeFile(`${dir}/valid.boardejectarchive`, bytes);
const entries = unzipSync(bytes);
entries[Object.keys(entries).find((p) => p.startsWith("assets/"))!] =
  strToU8("corrupted");
await writeFile(`${dir}/corrupt.boardejectarchive`, zipSync(entries));
