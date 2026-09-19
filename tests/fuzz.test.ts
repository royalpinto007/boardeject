import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createArchive, verifyArchive } from "../packages/archive/index";
import { inspectCaptureFile } from "../packages/freeform-parser/test-capture";

/**
 * Deterministic adversarial coverage for the two untrusted-data boundaries:
 * clipboard captures and archive files. Every case uses a fixed seed so CI
 * replays the exact same mutants. Deeper local runs:
 * BOARDEJECT_FUZZ_CASES=2000 npm test -- tests/fuzz.test.ts
 */

const CASES = Number(process.env.BOARDEJECT_FUZZ_CASES ?? 150);

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}

/** Byte-level mutants: flips, truncation, excision, insertion. */
function mutateBytes(rand: () => number, input: Uint8Array): Uint8Array {
  const kind = Math.floor(rand() * 4);
  const out = Uint8Array.from(input);
  if (kind === 0) {
    const flips = 1 + Math.floor(rand() * 8);
    for (let i = 0; i < flips; i += 1) {
      out[Math.floor(rand() * out.length)] = Math.floor(rand() * 256);
    }
    return out;
  }
  if (kind === 1) {
    return out.slice(0, Math.floor(rand() * out.length));
  }
  if (kind === 2) {
    const at = Math.floor(rand() * out.length);
    const len = Math.min(
      out.length - at,
      1 + Math.floor(rand() * Math.max(1, out.length / 4)),
    );
    const next = new Uint8Array(out.length - len);
    next.set(out.slice(0, at));
    next.set(out.slice(at + len), at);
    return next;
  }
  const at = Math.floor(rand() * (out.length + 1));
  const len = 1 + Math.floor(rand() * 64);
  const next = new Uint8Array(out.length + len);
  next.set(out.slice(0, at));
  for (let i = 0; i < len; i += 1) next[at + i] = Math.floor(rand() * 256);
  next.set(out.slice(at), at + len);
  return next;
}

const read = (path: string) => readFileSync(path);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

function envelopeFor(flavors: { uti: string; file: string }[]): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      format: "boardeject.clipboard",
      version: 1,
      flavors: flavors.map(({ uti, file }) => ({
        uti,
        base64: b64(read(`tests/fixtures/freeform-4.5/${file}`)),
      })),
    }),
  );
}

/** Envelope-object mutants: structural damage to the parsed JSON. */
function mutateEnvelope(
  rand: () => number,
  input: Uint8Array,
): { name: string; bytes: Uint8Array } {
  const ext = pick(rand, ["boardeject", "json"] as const);
  const text = new TextDecoder().decode(input);
  const kind = Math.floor(rand() * 5);
  let value: unknown;
  if (kind === 0) {
    value = text.slice(0, Math.floor(rand() * text.length));
  } else {
    const parsed = JSON.parse(text) as {
      format: string;
      version: number;
      flavors: { uti: string; base64: string }[];
    };
    if (kind === 1) {
      parsed.flavors = [];
    } else if (kind === 2) {
      parsed.version = 999;
    } else if (kind === 3) {
      parsed.flavors.push(parsed.flavors[0]);
    } else {
      parsed.flavors[0].base64 = "!!!not-base64!!!";
    }
    value =
      typeof parsed === "object" && rand() < 0.5
        ? JSON.stringify(parsed).slice(
            0,
            Math.floor(rand() * JSON.stringify(parsed).length),
          )
        : parsed;
  }
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return { name: `mutant.${ext}`, bytes: new TextEncoder().encode(body) };
}

describe("adversarial capture handling", { timeout: 120_000 }, () => {
  const corpus: { name: string; bytes: Uint8Array }[] = [
    {
      name: "labelled-connector.boardeject",
      bytes: envelopeFor([
        {
          uti: "com.apple.freeform.CRLNativeData",
          file: "labelled-connector.crlnative",
        },
        {
          uti: "com.apple.freeform.TSUDescription",
          file: "labelled-connector.tsudescription",
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          file: "labelled-connector.content.json",
        },
      ]),
    },
    {
      name: "real-board.crlnative",
      bytes: read("tests/fixtures/upstream/real-board.crlnative"),
    },
    {
      name: "ink-pen.drawing",
      bytes: read("tests/fixtures/upstream/ink-pen.drawing"),
    },
  ];

  it("never escapes malformed captures and always reports them", () => {
    const rand = mulberry32(0xc10c);
    let checked = 0;
    for (const { name, bytes } of corpus) {
      const isEnvelope = name.endsWith(".boardeject");
      for (let i = 0; i < CASES; i += 1) {
        const mutant = isEnvelope
          ? mutateEnvelope(rand, bytes)
          : {
              name,
              bytes: mutateBytes(rand, bytes),
            };
        let board: ReturnType<typeof inspectCaptureFile> | undefined;
        let thrown: unknown;
        try {
          board = inspectCaptureFile(mutant.name, mutant.bytes);
        } catch (error) {
          thrown = error;
        }
        if (thrown !== undefined) {
          expect(
            thrown,
            `${name} case ${i} threw a non-diagnostic error`,
          ).toBeInstanceOf(Error);
        } else {
          expect(Array.isArray(board!.issues)).toBe(true);
          expect(Array.isArray(board!.nodes)).toBe(true);
        }
        if (i % 10 === 0) {
          const again = (() => {
            try {
              const b = inspectCaptureFile(mutant.name, mutant.bytes);
              return JSON.stringify(b);
            } catch (error) {
              return `throw:${(error as Error).message}`;
            }
          })();
          const first = (() => {
            try {
              const b = inspectCaptureFile(mutant.name, mutant.bytes);
              return JSON.stringify(b);
            } catch (error) {
              return `throw:${(error as Error).message}`;
            }
          })();
          expect(again, `${name} case ${i} is nondeterministic`).toBe(first);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("adversarial archive verification", { timeout: 120_000 }, () => {
  const boardId = "11111111-2222-4333-8444-555555555555";
  const assetBytes = new TextEncoder().encode("original image");
  const baseInput: Parameters<typeof createArchive>[0] = {
    createdAt: "2026-09-14T17:55:51.000Z",
    board: {
      id: boardId,
      title: "Fuzz board",
      titleStatus: "verified",
      objectCount: 1,
      modifiedAt: "2026-09-14T17:55:51.000Z",
    },
    source: {
      kind: "freeform-snapshot",
      schemaStatus: "verified",
      databaseUserVersion: 16,
      schemaFingerprint: "verified-v16",
    },
    nativeFiles: {
      "native-records.json": new TextEncoder().encode(
        JSON.stringify({ boardId }),
      ),
    },
    objects: [{ id: "object-1" }],
    assets: [
      {
        nativeId: "asset-1",
        objectIds: ["object-1"],
        bytes: assetBytes,
        originalFilename: "image.png",
        mimeType: "image/png",
      },
    ],
  };

  it("fails damaged archives closed without throwing", async () => {
    const pristine = await createArchive({ ...baseInput });
    const sane = await verifyArchive(pristine);
    expect(sane.valid).toBe(true);

    const rand = mulberry32(0xa4c41e);
    for (let i = 0; i < CASES; i += 1) {
      const mutant = mutateBytes(rand, pristine);
      const result = await verifyArchive(mutant);
      expect(typeof result.valid).toBe("boolean");
      if (mutant.length < pristine.length / 2) {
        expect(result.valid).toBe(false);
      }
    }

    expect((await verifyArchive(pristine.slice(0, 0))).valid).toBe(false);
    expect(
      (await verifyArchive(new TextEncoder().encode("not a zip"))).valid,
    ).toBe(false);
  });

  it("rejects manifests with malformed records instead of crashing", async () => {
    const pristine = await createArchive({ ...baseInput });
    const entries = unzipSync(pristine);
    const manifest = JSON.parse(
      new TextDecoder().decode(entries["manifest.json"]),
    ) as { files: unknown[]; assets: unknown[] };
    manifest.files = [null, { nope: true }, ...manifest.files];
    manifest.assets = [{ nativeId: "ghost" }, null, ...manifest.assets];
    entries["manifest.json"] = new TextEncoder().encode(
      JSON.stringify(manifest),
    );
    const result = await verifyArchive(zipSync(entries));
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((message) => message.includes("invalid file records")),
    ).toBe(true);
    expect(
      result.errors.some((message) =>
        message.includes("invalid asset records"),
      ),
    ).toBe(true);
  });
});
