import {
  inspectArchive,
  extractAssets,
  type ExplorerResult,
} from "../../../packages/archive/explorer";
let current: ExplorerResult | undefined;
self.onmessage = async ({
  data,
}: MessageEvent<{ id: number; bytes: ArrayBuffer; extract?: boolean }>) => {
  try {
    if (data.extract) {
      if (!current) throw new Error("Open and verify an archive first.");
      const zip = extractAssets(current);
      self.postMessage({ id: data.id, zip });
      return;
    }
    current = await inspectArchive(new Uint8Array(data.bytes));
    self.postMessage({
      id: data.id,
      result: current,
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error:
        error instanceof Error
          ? error.message
          : "Archive could not be opened. Try a smaller file.",
    });
  }
};
