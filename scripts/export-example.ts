import { writeFileSync } from "node:fs";
import { exampleBoard } from "../examples/board.ts";
import { convert } from "../packages/excalidraw-converter/index.ts";
writeFileSync(
  "examples/example.excalidraw",
  JSON.stringify(convert(exampleBoard), null, 2) + "\n",
);
