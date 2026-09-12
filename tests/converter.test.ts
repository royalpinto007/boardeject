import { expect, it } from "vitest";
import { exampleBoard } from "../examples/board";
import { convert } from "../packages/excalidraw-converter/index";

it("emits editable objects with reciprocal arrow relationships", () => {
  const result = convert(exampleBoard);
  expect(result.type).toBe("excalidraw");
  const card = result.elements.find((element) => element.id === "card-0");
  const arrow = result.elements.find((element) => element.id === "arrow-0");
  expect(card?.boundElements).toContainEqual({ id: "arrow-0", type: "arrow" });
  expect(arrow).toMatchObject({
    startBinding: { elementId: "card-0" },
    endBinding: { elementId: "card-1" },
  });
  expect(
    result.elements.find((element) => element.id === "sticky-text"),
  ).toMatchObject({
    type: "text",
    text: "Still your board.\nStill editable.",
    groupIds: ["note"],
  });
});
it("produces deterministic portable JSON", () =>
  expect(JSON.stringify(convert(exampleBoard))).toBe(
    JSON.stringify(convert(exampleBoard)),
  ));
