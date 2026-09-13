self.onmessage = async ({
  data,
}: MessageEvent<{ name: string; bytes: ArrayBuffer }>) => {
  try {
    // Install the listener before libfreeform's asynchronous WASM initialization.
    const { inspectCaptureFile } =
      await import("../../../packages/freeform-parser/test-capture");
    self.postMessage({
      board: inspectCaptureFile(data.name, new Uint8Array(data.bytes)),
    });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Native decoder failed. Try a smaller, valid capture.",
    });
  }
};
