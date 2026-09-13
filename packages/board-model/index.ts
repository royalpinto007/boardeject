/** Output-independent model. All coordinates are canvas-space points. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface Issue {
  itemId?: string;
  severity: "unsupported" | "approximation" | "warning";
  message: string;
}
export interface Appearance {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}
export interface BaseNode {
  id: string;
  bounds: Bounds;
  appearance: Appearance;
  groups: string[];
  sourceStyle?: unknown;
}
export type BoardNode = BaseNode &
  (
    | { kind: "rectangle" | "ellipse" | "diamond" }
    | {
        kind: "text";
        text: string;
        fontSize: number;
        textAlign?: "left" | "center" | "right";
      }
    | {
        kind: "arrow";
        start: [number, number];
        end: [number, number];
        startId?: string;
        endId?: string;
      }
    | { kind: "ink"; points: [number, number][] }
    | {
        kind: "image";
        dataURL: string;
        mimeType: "image/png" | "image/jpeg" | "image/svg+xml";
      }
  );
export interface Board {
  nodes: BoardNode[];
  issues: Issue[];
  sourceItems: number;
  source: "freeform" | "synthetic-example";
}
