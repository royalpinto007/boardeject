self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const { parseCapture } =
      await import("../../../packages/freeform-parser/index");
    const { normalize } =
      await import("../../../packages/freeform-parser/normalize");
    self.postMessage({ board: normalize(parseCapture(event.data)) });
  } catch {
    self.postMessage({
      error:
        "Capture could not be decoded. Check the file format and size, or copy a smaller Freeform selection.",
    });
  }
};
