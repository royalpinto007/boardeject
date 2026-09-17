import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodePasteboard } from "libfreeform";
import { normalize } from "../packages/freeform-parser/normalize";
import { convert } from "../packages/excalidraw-converter/index";

const root = "tests/fixtures/freeform-4.5/";

function parse(name: string) {
  return normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(`${root}${name}.crlnative`),
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          bytes: readFileSync(`${root}${name}.content.json`),
        },
      ],
    }),
  );
}

it.each([
  ["nested-transformed-group", 150, 0],
  ["nested-transformed-group-scaled", 120, 0],
  ["nested-transformed-group-rotated", 120, 315.40924072265625],
] as const)(
  "recovers verified canvas-space geometry from %s",
  (name, size, angle) => {
    const board = parse(name);
    expect(board.nodes).toHaveLength(3);
    for (const node of board.nodes) expect(node.bounds.width).toBeCloseTo(size);
    for (const node of board.nodes)
      expect(node.bounds.rotation).toBeCloseTo((angle * Math.PI) / 180);
    expect(board.nodes.map((node) => node.groups.length)).toEqual([2, 2, 1]);
    expect(board.nodes[0].groups[1]).toBe(board.nodes[2].groups[0]);
    expect(board.nodes[0].groups[0]).toBe(board.nodes[1].groups[0]);
    expect(board.nodes.map((node) => node.kind)).toEqual([
      "rectangle",
      "ellipse",
      "rectangle",
    ]);
    expect(
      board.issues.some((entry) =>
        entry.message.includes("nested-group translation"),
      ),
    ).toBe(true);
  },
);

it("keeps the recovered nested groups editable in Excalidraw", () => {
  const output = convert(parse("nested-transformed-group-rotated"));
  expect(output.elements).toHaveLength(3);
  expect(output.elements.map((element) => element.groupIds.length)).toEqual([
    2, 2, 1,
  ]);
  expect(output.elements.every((element) => element.angle !== 0)).toBe(true);
});

it.each([
  [
    "a horizontal flip",
    (group: Record<string, any>) => {
      group.children[0].group.children[0].shape.geometry.flip_horizontally = true;
    },
  ],
  [
    "a child angle that disagrees with its group",
    (group: Record<string, any>) => {
      group.children[0].group.children[0].shape.geometry.angle = 12;
    },
  ],
] as const)("rejects a complete native group with %s", (_, mutate) => {
  const name = "nested-transformed-group";
  const content = JSON.parse(
    readFileSync(`${root}${name}.content.json`, "utf8"),
  );
  mutate(content[0]);
  const board = normalize(
    decodePasteboard({
      flavors: [
        {
          uti: "com.apple.freeform.CRLNativeData",
          bytes: readFileSync(`${root}${name}.crlnative`),
        },
        {
          uti: "com.apple.apps.content-language.canvas-object-1.0",
          bytes: new TextEncoder().encode(JSON.stringify(content)),
        },
      ],
    }),
  );
  expect(board.nodes).toEqual([]);
  expect(board.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        severity: "unsupported",
        message: expect.stringMatching(/compatibility is not supported/),
      }),
    ]),
  );
});
