import { expect, it } from "vitest";
import { embeddedImage, convertInk } from "../packages/freeform-parser/media";
import type { Issue } from "../packages/board-model/index";

it("rejects HTML or remote URL content as embedded images", () => {
  expect(
    embeddedImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),
  ).toBeUndefined();
  expect(
    embeddedImage(new TextEncoder().encode("https://example.com/image.png")),
  ).toBeUndefined();
});
it("retains exact PNG bytes in a data URL", () => {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMioAAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  expect(embeddedImage(bytes)).toEqual({
    mimeType: "image/png",
    dataURL: `data:image/png;base64,${base64}`,
  });
});
it("applies the full stroke affine transform to rendered samples", () => {
  const issues: Issue[] = [];
  const result = convertInk(
    [
      {
        inkType: "pen",
        inkIdentifier: "pen",
        pointRole: "renderedSample",
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        transform: { a: 2, b: 0, c: 0, d: 3, tx: 10, ty: 20 },
        rawData: new Uint8Array(),
      },
    ],
    "ink",
    issues,
  );
  expect(result[0]).toMatchObject({
    bounds: { x: 12, y: 26, width: 4, height: 6 },
    points: [
      [0, 0],
      [4, 6],
    ],
  });
  expect(issues[0].severity).toBe("approximation");
});
it("samples spline controls and reports the endpoint approximation", () => {
  const issues: Issue[] = [];
  const result = convertInk(
    [
      {
        inkType: "pen",
        inkIdentifier: "pen",
        pointRole: "splineControl",
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        rawData: new Uint8Array(),
      },
    ],
    "ink",
    issues,
  );
  expect(result).toHaveLength(1);
  expect(result[0].kind === "ink" && result[0].points.length > 2).toBe(true);
  expect(issues[0].severity).toBe("approximation");
});
