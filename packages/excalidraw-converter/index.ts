import type { Board } from "../board-model/index";

export function convert(board: Board) {
  const files: Record<
    string,
    { id: string; dataURL: string; mimeType: string; created: number }
  > = {};
  const elements = board.nodes.map((node, ordinal) => {
    const base = {
      id: node.id,
      type: node.kind,
      x: node.bounds.x,
      y: node.bounds.y,
      width: node.bounds.width,
      height: node.bounds.height,
      angle: node.bounds.rotation,
      strokeColor: node.appearance.stroke,
      backgroundColor: node.appearance.fill,
      strokeWidth: node.appearance.strokeWidth,
      opacity: node.appearance.opacity,
      fillStyle: "solid",
      strokeStyle: "solid",
      roughness: 0,
      roundness: null,
      seed: ordinal + 1,
      version: 1,
      versionNonce: ordinal + 1,
      index: null,
      isDeleted: false,
      groupIds: node.groups,
      frameId: null,
      boundElements: board.nodes.flatMap((other) =>
        other.kind === "arrow" &&
        (other.startId === node.id || other.endId === node.id)
          ? [{ id: other.id, type: "arrow" }]
          : [],
      ),
      updated: 0,
      link: null,
      locked: false,
    };
    if (node.kind === "text")
      return {
        ...base,
        text: node.text,
        originalText: node.text,
        fontSize: node.fontSize,
        fontFamily: 2,
        textAlign: "left",
        verticalAlign: "top",
        containerId: null,
        autoResize: false,
        lineHeight: 1.25,
      };
    if (node.kind === "arrow")
      return {
        ...base,
        x: node.start[0],
        y: node.start[1],
        angle: 0,
        width: Math.abs(node.end[0] - node.start[0]),
        height: Math.abs(node.end[1] - node.start[1]),
        points: [
          [0, 0],
          [node.end[0] - node.start[0], node.end[1] - node.start[1]],
        ],
        startBinding: node.startId
          ? { elementId: node.startId, focus: 0, gap: 1 }
          : null,
        endBinding: node.endId
          ? { elementId: node.endId, focus: 0, gap: 1 }
          : null,
        startArrowhead: null,
        endArrowhead: "arrow",
        elbowed: false,
        lastCommittedPoint: null,
      };
    if (node.kind === "ink")
      return {
        ...base,
        type: "freedraw",
        points: node.points,
        pressures: [],
        simulatePressure: true,
        lastCommittedPoint: null,
      };
    if (node.kind === "image") {
      files[node.id] = {
        id: node.id,
        dataURL: node.dataURL,
        mimeType: node.mimeType,
        created: 0,
      };
      return {
        ...base,
        fileId: node.id,
        status: "saved",
        scale: [1, 1],
        crop: null,
      };
    }
    return base;
  });
  return {
    type: "excalidraw" as const,
    version: 2,
    source: "BoardEject",
    elements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files,
  };
}
export type ExcalidrawDocument = ReturnType<typeof convert>;
