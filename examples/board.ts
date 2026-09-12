import type { Board, BoardNode } from "../packages/board-model/index";

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill = "transparent",
) => ({
  id,
  bounds: { x, y, width, height, rotation: 0 },
  appearance: { fill, stroke: "#243b32", strokeWidth: 1.5, opacity: 100 },
  groups: [],
});
const nodes: BoardNode[] = [
  {
    ...node("title", 50, 20, 680, 50),
    kind: "text",
    text: "Your ideas deserve an exit.",
    fontSize: 32,
  },
  ...["Collect", "Connect", "Create"].flatMap((text, index): BoardNode[] => [
    {
      ...node(`card-${index}`, 50 + index * 260, 130, 190, 120, "#eaf3ec"),
      kind: "rectangle",
    },
    {
      ...node(`label-${index}`, 75 + index * 260, 172, 145, 34),
      kind: "text",
      text,
      fontSize: 25,
      groups: [`label-group-${index}`],
    },
  ]),
  {
    ...node("arrow-0", 241, 190, 68, 0),
    kind: "arrow",
    start: [241, 190],
    end: [309, 190],
    startId: "card-0",
    endId: "card-1",
  },
  {
    ...node("arrow-1", 501, 190, 68, 0),
    kind: "arrow",
    start: [501, 190],
    end: [569, 190],
    startId: "card-1",
    endId: "card-2",
  },
  {
    ...node("sticky", 50, 315, 215, 125, "#fff2b5"),
    kind: "rectangle",
    groups: ["note"],
  },
  {
    ...node("sticky-text", 70, 335, 175, 80),
    kind: "text",
    text: "Still your board.\nStill editable.",
    fontSize: 22,
    groups: ["note"],
  },
  {
    ...node("scribble", 310, 350, 190, 60),
    kind: "ink",
    points: [
      [0, 40],
      [20, 20],
      [50, 32],
      [80, 10],
      [110, 20],
      [145, 0],
      [170, 10],
      [190, 5],
    ],
  },
];
export const exampleBoard: Board = {
  source: "synthetic-example",
  sourceItems: nodes.length,
  nodes,
  issues: [
    {
      severity: "warning",
      message:
        "Synthetic converter example, not a capture from Apple Freeform. Native clipboard validation requires a Mac.",
    },
  ],
};
