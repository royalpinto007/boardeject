import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodeCrlNative } from "libfreeform";

const root = "tests/fixtures/freeform-4.5/tables/";
const read = (name: string, extension: string) =>
  readFileSync(`${root}${name}.${extension}`);
const structure = (data: Buffer) =>
  data
    .toString()
    .match(
      /\\(?:cellx-?\d+|clwWidth-?\d+|clheight-?\d+|cell\b|row\b|trowd\b)/g,
    );

it.each(["A1", "B1", "A2", "B2"])(
  "preserves native row-major text with only %s changed and restored",
  (cell) => {
    const expected = "A1\tB1\nA2\tB2\n";
    const index = ["A1", "B1", "A2", "B2"].indexOf(cell);
    expect(read("table-baseline", "txt").toString()).toBe(expected);
    expect(read(`table-change-${cell}`, "txt").toString()).toBe(
      expected.replace(cell, `X${index + 1}`),
    );
    expect(read(`table-restore-${cell}`, "txt").toString()).toBe(expected);
    const baseline = read("table-baseline", "rtf");
    expect(
      structure(baseline)?.filter((token) => token === "\\cell"),
    ).toHaveLength(4);
    expect(
      structure(baseline)?.filter((token) => token === "\\row"),
    ).toHaveLength(2);
    for (const state of ["change", "restore"]) {
      expect(structure(read(`table-${state}-${cell}`, "rtf"))).toEqual(
        structure(baseline),
      );
    }
  },
);

it.each([
  "table-baseline",
  ...["A1", "B1", "A2", "B2"].flatMap((cell) => [
    `table-change-${cell}`,
    `table-restore-${cell}`,
  ]),
])("keeps the native version gate for %s", (name) => {
  expect(decodeCrlNative(read(name, "crlnative")).compatibility).toEqual({
    kind: "unsupported",
    minimumVersion: 7,
  });
});
