import { parseCapture } from "../../../packages/freeform-parser/index";
import { normalize } from "../../../packages/freeform-parser/normalize";
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ board: normalize(parseCapture(event.data)) });
  } catch {
    self.postMessage({
      error:
        "Capture could not be decoded. Check the file format and size, or copy a smaller Freeform selection.",
    });
  }
};
