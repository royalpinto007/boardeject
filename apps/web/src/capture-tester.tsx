import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Board } from "../../../packages/board-model/index";
import { convert } from "../../../packages/excalidraw-converter/index";
import "./capture-tester.css";
const Editor = lazy(() => import("./editor"));

export default function CaptureTester() {
  const [board, setBoard] = useState<Board>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fileName, setFileName] = useState("No file selected");
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sequence = useRef(0);
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timer.current);
  }
  useEffect(() => {
    document.title = "Experimental Capture Tester | BoardEject";
    return () => {
      sequence.current++;
      stop();
    };
  }, []);
  async function inspect(files: File[]) {
    const id = ++sequence.current;
    stop();
    setBoard(undefined);
    setEditing(false);
    setError("");
    setStatus("");
    setBusy(false);
    if (files.length !== 1) {
      setError("Choose one capture file at a time.");
      return;
    }
    const file = files[0];
    setFileName(file.name);
    if (file.size > 45 * 1024 * 1024) {
      setError("File exceeds 45 MiB. Copy a smaller selection.");
      return;
    }
    setBusy(true);
    setStatus(`Inspecting ${file.name} on this device…`);
    try {
      const bytes = await file.arrayBuffer();
      if (id !== sequence.current) return;
      const current = new Worker(
        new URL("./capture-worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = current;
      timer.current = setTimeout(() => {
        stop();
        setBusy(false);
        setStatus("");
        setError("Decoding exceeded 15 seconds. Try a smaller selection.");
      }, 15000);
      current.onmessage = ({ data }) => {
        if (id !== sequence.current) return;
        stop();
        setBusy(false);
        setStatus("");
        if (data.board) setBoard(data.board);
        else setError(data.error || "Capture could not be decoded.");
      };
      current.onerror = () => {
        if (id !== sequence.current) return;
        stop();
        setBusy(false);
        setStatus("");
        setError("Decoder could not run. Refresh or try a smaller capture.");
      };
      current.postMessage({ name: file.name, bytes }, [bytes]);
    } catch {
      if (id !== sequence.current) return;
      stop();
      setBusy(false);
      setStatus("");
      setError(
        "Could not read this file. Select a readable capture and try again.",
      );
    }
  }
  function download() {
    if (!board?.nodes.length) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(convert(board), null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "capture.excalidraw";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/">
          <img src="/favicon.svg" width="30" height="30" alt="" /> BoardEject
        </a>
        <nav aria-label="Main navigation">
          <a href="/mac-helper">Mac helper</a>
          <a href="/">Home</a>
          <a
            className="nav-source"
            href="https://github.com/royalpinto007/boardeject"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
      </header>
      <main className="capture-tester">
        <span className="preview-badge">Experimental / Capture Tester</span>
        <h1>Test a capture.</h1>
        <p className="capture-intro">
          Choose a file. Get editable Excalidraw. Nothing is uploaded.
        </p>
        <details className="capture-help">
          <summary>Supported files and conversion limits</summary>
          <p>
            Use the macOS helper’s <code>.boardeject</code> file (or its JSON
            envelope). Raw <code>.crlnative</code> and <code>.drawing</code>{" "}
            fixtures can be inspected without companion assets. Verified
            Freeform 4.5 table captures, including multiple tables, colors,
            borders, and attached text, can be recovered from version 7. Other
            version-7 board layouts remain unsupported unless a documented
            sidecar fallback applies.
          </p>
        </details>
        <a href="/mac-helper">How to create a capture →</a>
        <section
          className="capture-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            if (files.length) void inspect(files);
          }}
          aria-label="Capture file drop area"
        >
          <span className="capture-icon" aria-hidden="true">
            ↥
          </span>
          <strong className="capture-drop-title">Drop your capture here</strong>
          <input
            id="capture-file"
            className="capture-file-input"
            type="file"
            accept=".boardeject,.json,.crlnative,.drawing"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length) void inspect(files);
            }}
          />
          <label className="capture-file-button" htmlFor="capture-file">
            Choose capture
          </label>
          <span className="capture-file-name" aria-live="polite">
            {fileName}
          </span>
          <small>Up to 32 MiB raw / 45 MiB capture.</small>
        </section>
        <div className="capture-samples" aria-label="Sample captures">
          <span>Try a sample</span>
          <a href="/samples/ink-pen.drawing" download>
            Editable ink sample ↓
          </a>
          <a href="/samples/real-board.crlnative" download>
            Unsupported-board sample ↓
          </a>
          <a href="/samples/source">Source and license →</a>
        </div>
        <p role="status" aria-live="polite">
          {busy ? status : board ? "Ready to review." : ""}
        </p>
        {error && (
          <p role="alert" className="capture-error">
            {error}
          </p>
        )}
        {board && (
          <section className="capture-report" aria-label="Conversion report">
            <h2>Conversion report</h2>
            {board.nodes.length > 0 && (
              <div className="capture-actions">
                <button onClick={() => setEditing(true)}>
                  Preview result <span aria-hidden="true">↗</span>
                </button>
                <button className="secondary" onClick={download}>
                  Download .excalidraw <span aria-hidden="true">↓</span>
                </button>
              </div>
            )}
            <dl>
              <div>
                <dt>Detected source objects</dt>
                <dd>{board.sourceItems}</dd>
              </div>
              <div>
                <dt>Converted output objects</dt>
                <dd>{board.nodes.length}</dd>
              </div>
              <div>
                <dt>Unsupported reports</dt>
                <dd>
                  {
                    board.issues.filter((i) => i.severity === "unsupported")
                      .length
                  }
                </dd>
              </div>
              <div>
                <dt>Partial / warning reports</dt>
                <dd>
                  {
                    board.issues.filter((i) => i.severity !== "unsupported")
                      .length
                  }
                </dd>
              </div>
            </dl>
            <details open={!board.nodes.length}>
              <summary>Conversion details ({board.issues.length})</summary>
              <p>
                Counts reflect decoder output, not every visible object in
                Freeform. Report counts are diagnostics, not unique element
                counts.
              </p>
              {board.issues.length ? (
                <ul>
                  {board.issues.map((issue, index) => (
                    <li key={index}>
                      <strong>{issue.severity}</strong>
                      {issue.itemId ? ` (${issue.itemId})` : ""}:{" "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No conversion warnings reported. Still inspect your result.
                </p>
              )}
            </details>
            {board.nodes.length ? (
              <>
                <details>
                  <summary>Converted object list</summary>
                  <ul>
                    {board.nodes.map((n) => (
                      <li key={n.id}>
                        {n.kind}: {n.id}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p>No editable output. See conversion details above.</p>
            )}
          </section>
        )}
        <footer className="site-footer">
          <a className="brand" href="/">
            <img src="/favicon.svg" width="30" height="30" alt="" /> BoardEject
          </a>
          <div className="footer-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a
              href="https://github.com/royalpinto007/boardeject"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code ↗
            </a>
            <a
              href="https://www.buymeacoffee.com/royalpinto007"
              target="_blank"
              rel="noopener noreferrer"
            >
              Buy me a coffee ↗
            </a>
          </div>
        </footer>
      </main>
      {editing && board && (
        <Suspense
          fallback={
            <p className="visually-hidden" role="status">
              Loading editor
            </p>
          }
        >
          <Editor document={convert(board)} onClose={() => setEditing(false)} />
        </Suspense>
      )}
    </>
  );
}
