import { lazy, Suspense, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { exampleBoard } from "../../../examples/board";
import type { Board } from "../../../packages/board-model/index";
import { convert } from "../../../packages/excalidraw-converter/index";
import "./style.css";
Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/vendor/excalidraw/" });
const Editor = lazy(() => import("./editor"));

function App() {
  const [board, setBoard] = useState<Board>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  function parse(source: string) {
    if (source.length > 45 * 1024 * 1024) {
      setStatus("Capture is too large. Maximum 45 MiB.");
      return;
    }
    setBusy(true);
    setStatus("Reading your board…");
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      worker.terminate();
      clearTimeout(timer);
      setBusy(false);
    };
    const timer = window.setTimeout(() => {
      finish();
      setStatus("Decoding exceeded 15 seconds. Try a smaller selection.");
    }, 15000);
    worker.onmessage = ({ data }) => {
      finish();
      if (data.board) {
        setBoard(data.board);
        setStatus("Capture inspected. Review conversion details below.");
      } else setStatus(data.error);
    };
    worker.onerror = () => {
      finish();
      setStatus("Decoder could not start. Refresh and try again.");
    };
    worker.postMessage(source);
  }
  async function clipboard() {
    try {
      parse(await navigator.clipboard.readText());
    } catch {
      setStatus(
        "Native Freeform types are not available to ordinary browser paste. Use the macOS helper, then choose its .boardeject capture below.",
      );
    }
  }
  function download() {
    if (!board) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(convert(board), null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "board.excalidraw";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      {editing && board && (
        <Suspense fallback={<p role="status">Opening Excalidraw…</p>}>
          <Editor document={convert(board)} onClose={() => setEditing(false)} />
        </Suspense>
      )}
      <header>
        <a href="/" className="brand">
          <span aria-hidden="true">↗</span> BoardEject
        </a>
        <span className="local">Your ideas. No lock-in.</span>
      </header>
      <main>
        <div className="eyebrow">AN EXIT FOR YOUR IDEAS</div>
        <h1>
          Your board.
          <br />
          <span>Your format.</span>
        </h1>
        <p className="intro">
          Copy your ideas out of Apple Freeform.
          <br />
          Keep them editable in Excalidraw.
        </p>
        <section className="import" aria-label="Import board">
          <div className="import-icon" aria-hidden="true">
            ↥
          </div>
          <h2>Bring your board with you.</h2>
          <p>
            Import a clipboard capture from the macOS helper.
            <br />
            Your board stays on this device.
          </p>
          <div className="actions">
            <button disabled={busy} onClick={clipboard}>
              Import Freeform Clipboard <span>↗</span>
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              Choose capture file
            </button>
          </div>
          <input
            hidden
            ref={file}
            type="file"
            accept=".boardeject,application/json"
            onChange={async (event) => {
              const selected = event.target.files?.[0];
              if (!selected) return;
              if (selected.size > 45 * 1024 * 1024) {
                setStatus("Capture exceeds 45 MiB.");
                return;
              }
              parse(await selected.text());
              event.target.value = "";
            }}
          />
          <p className="fine">
            macOS helper required. Real Freeform clipboard validation is
            pending.
          </p>
        </section>
        <p role="status" className="status">
          {status}
        </p>
        <div className="try">
          <span>No Mac? Explore the output.</span>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              setBoard(exampleBoard);
              setStatus(
                "Synthetic example loaded. This demonstrates the converter, not a captured Freeform board.",
              );
            }}
          >
            Try example board ↗
          </button>
        </div>
        {board && (
          <section className="result">
            <div className="result-heading">
              <div className="eyebrow">
                {board.source === "synthetic-example"
                  ? "SYNTHETIC EXAMPLE"
                  : "CAPTURE REPORT"}
              </div>
              <h2>
                {board.nodes.length
                  ? `${board.nodes.length} editable elements`
                  : "No safely convertible elements"}
              </h2>
            </div>
            <p>
              {
                board.issues.filter((item) => item.severity === "unsupported")
                  .length
              }{" "}
              unsupported findings · {board.sourceItems} source elements
            </p>
            {board.nodes.length > 0 && (
              <>
                <div className="preview" aria-label="Converted board preview">
                  <svg
                    viewBox="0 0 820 490"
                    role="img"
                    aria-label="Editable example showing connected cards and a sticky note"
                  >
                    {board.nodes.map((node) =>
                      node.kind === "text" ? (
                        <text
                          key={node.id}
                          x={node.bounds.x}
                          y={node.bounds.y + node.fontSize}
                          fontSize={node.fontSize}
                          fill={node.appearance.stroke}
                        >
                          {node.text.split("\n").map((line, i) => (
                            <tspan
                              key={i}
                              x={node.bounds.x}
                              dy={i ? node.fontSize * 1.25 : 0}
                            >
                              {line}
                            </tspan>
                          ))}
                        </text>
                      ) : node.kind === "rectangle" ? (
                        <rect
                          key={node.id}
                          x={node.bounds.x}
                          y={node.bounds.y}
                          width={node.bounds.width}
                          height={node.bounds.height}
                          fill={node.appearance.fill}
                          stroke={node.appearance.stroke}
                        />
                      ) : node.kind === "arrow" ? (
                        <path
                          key={node.id}
                          d={`M${node.start.join(",")} L${node.end.join(",")} m-8,-5 l8,5 l-8,5`}
                          fill="none"
                          stroke={node.appearance.stroke}
                        />
                      ) : node.kind === "ink" ? (
                        <polyline
                          key={node.id}
                          points={node.points
                            .map(
                              ([x, y]) =>
                                `${x + node.bounds.x},${y + node.bounds.y}`,
                            )
                            .join(" ")}
                          fill="none"
                          stroke={node.appearance.stroke}
                          strokeWidth="2"
                        />
                      ) : null,
                    )}
                  </svg>
                </div>
                <div className="actions">
                  <button onClick={() => setEditing(true)}>
                    Open in Excalidraw ↗
                  </button>
                  <button className="secondary" onClick={download}>
                    Download .excalidraw ↓
                  </button>
                </div>
                <p className="fine">
                  Open the downloaded file in Excalidraw. This preview is not an
                  editor.
                </p>
              </>
            )}
            <details open={!board.nodes.length}>
              <summary>Conversion details ({board.issues.length})</summary>
              <ul>
                {board.issues.map((issue, i) => (
                  <li key={i}>
                    <strong>{issue.severity}</strong>: {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
        <footer>
          <span>
            Apple Freeform → Copy board → BoardEject → Editable Excalidraw
          </span>
          <p>No account. No uploads. No lock-in.</p>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
