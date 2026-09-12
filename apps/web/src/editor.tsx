import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawDocument } from "../../../packages/excalidraw-converter/index";
import "@excalidraw/excalidraw/index.css";

export default function Editor({
  document,
  onClose,
}: {
  document: ExcalidrawDocument;
  onClose: () => void;
}) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#fff", zIndex: 10 }}
    >
      <div
        style={{
          height: 54,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "0 20px",
          borderBottom: "1px solid #ddd",
        }}
      >
        <button className="text-button" onClick={onClose}>
          ← BoardEject
        </button>
        <span>
          Excalidraw ·{" "}
          {document.source === "BoardEject" ? "Editable board" : "Board"} ·
          download to save
        </span>
      </div>
      <div style={{ height: "calc(100% - 54px)" }}>
        <Excalidraw
          initialData={
            {
              ...document,
              scrollToContent: true,
            } as unknown as ExcalidrawInitialDataState
          }
          UIOptions={{
            canvasActions: {
              export: { saveFileToDisk: true },
              saveAsImage: true,
            },
          }}
          onChange={(elements, state) => {
            if (new URLSearchParams(location.search).has("debug"))
              Object.assign(window, {
                boardejectSnapshot: () =>
                  JSON.parse(
                    JSON.stringify({
                      elements,
                      state: {
                        scrollX: state.scrollX,
                        scrollY: state.scrollY,
                        zoom: state.zoom,
                        offsetLeft: state.offsetLeft,
                        offsetTop: state.offsetTop,
                      },
                    }),
                  ),
              });
          }}
        >
          <MainMenu>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu>
        </Excalidraw>
      </div>
    </div>
  );
}
