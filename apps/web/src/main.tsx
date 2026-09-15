import { lazy, Suspense, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { exampleBoard } from "../../../examples/board";
import type { Board } from "../../../packages/board-model/index";
import { convert } from "../../../packages/excalidraw-converter/index";
import "./style.css";
Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/vendor/excalidraw/" });
const Editor = lazy(() => import("./editor"));
const CaptureTester = lazy(() => import("./capture-tester"));

function App() {
  const [board, setBoard] = useState<Board>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  function example() {
    setBoard(exampleBoard);
    setStatus(
      "Synthetic example loaded. This demonstrates editable output, not a captured Freeform board.",
    );
    window.setTimeout(
      () =>
        document.getElementById("result")?.scrollIntoView({ block: "center" }),
      0,
    );
  }
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
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {editing && board && (
        <Suspense fallback={<p role="status">Opening Excalidraw…</p>}>
          <Editor document={convert(board)} onClose={() => setEditing(false)} />
        </Suspense>
      )}
      <header className="site-header">
        <a href="/" className="brand">
          <span aria-hidden="true">↗</span> BoardEject
        </a>
        <nav aria-label="Main navigation">
          <a href="/test-capture">Test a capture ↗</a>
          <a
            href="https://github.com/royalpinto007/boardeject"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-source"
          >
            GitHub ↗
          </a>
        </nav>
      </header>
      <main className="landing" id="main-content" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <a className="preview-badge" href="#preview-status">
              <span /> Open source · See current support{" "}
              <span aria-hidden="true">↗</span>
            </a>
            <h1 id="hero-title">
              Your board.
              <br />
              <span>Your format.</span>
            </h1>
            <p className="intro">
              Convert Apple Freeform boards into editable Excalidraw files,
              locally, privately, and without flattening.
            </p>
            <div className="actions hero-actions">
              <button onClick={example} disabled={busy}>
                Try example board <span aria-hidden="true">↗</span>
              </button>
              <a className="button secondary" href="#import">
                Import your board <span aria-hidden="true">↓</span>
              </a>
            </div>
            <p className="hero-note">
              No account. No uploads. Your board stays yours.
            </p>
            <p className="hero-note">
              An editable escape route, not another whiteboard.
            </p>
          </div>
          <figure className="demo" id="demo">
            <div className="demo-bar">
              <span className="demo-dot" />{" "}
              <span>An editable board, in action</span>
              <span className="file-tag">.excalidraw</span>
            </div>
            <video
              controls
              muted
              playsInline
              preload="metadata"
              poster="/media/demo-poster.png"
              aria-label="Demo: moving a card, following connectors, and editing text in Excalidraw"
            >
              <source src="/media/demo.mp4" type="video/mp4" />
              <a href="/media/demo.mp4">Watch the board editing demo</a>
            </video>
            <figcaption>
              <strong>Move a card. The arrow follows.</strong>
              <span>Real app recording · Synthetic example board</span>
            </figcaption>
          </figure>
        </section>
        <p className="flow-label">How it works</p>
        <div className="flow" aria-label="Conversion workflow">
          <span>Apple Freeform</span>
          <span aria-hidden="true">→</span>
          <span>Copy + macOS helper</span>
          <span aria-hidden="true">→</span>
          <strong>BoardEject</strong>
          <span aria-hidden="true">→</span>
          <span>Editable Excalidraw</span>
        </div>
        <p className="flow-note">
          Copy your objects, save a capture with the macOS helper, then import
          and review the result. Supported shapes, text and table cells stay
          editable. <a href="#preview-status">Check support for your board.</a>
        </p>
        <section className="workspace" id="import" aria-label="Import board">
          <div className="workspace-copy">
            <h2>
              A new format. <br />
              Not a fresh start.
            </h2>
            <p>
              Import your capture. Check the result. Keep creating in
              Excalidraw.
            </p>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/royalpinto007/boardeject/blob/main/docs/clipboard.md"
            >
              Set up the macOS helper ↗
            </a>
            <p className="fine">
              Direct Freeform paste is unavailable in browsers. Copy a
              BoardEject JSON capture here, or choose the helper’s file.
            </p>
          </div>
          <div className="import">
            <div className="import-icon" aria-hidden="true">
              ↥
            </div>
            <h3>Import a Freeform capture</h3>
            <p>Use the file or copied data from the macOS helper.</p>
            <div className="actions">
              <button disabled={busy} onClick={clipboard}>
                Import copied BoardEject capture <span>↗</span>
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
            <p className="fine">Processed in your browser. Never uploaded.</p>
            <p role="status" className="status">
              {status}
            </p>
          </div>
        </section>
        {board && (
          <section
            className="result"
            id="result"
            aria-label="Conversion result"
          >
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
        <section
          className="contribute"
          id="preview-status"
          aria-labelledby="preview-title"
        >
          <div className="contribute-heading">
            <span className="preview-badge">Current status · v0.0.2</span>
            <h2 id="preview-title">Help build the escape route.</h2>
            <p>
              Try your board. Tell us what needs work. Help make the next one
              better.
            </p>
          </div>
          <div className="fidelity-grid">
            <div>
              <span className="state-label">Try now</span>
              <h3>Real editable output</h3>
              <p>
                Move shapes. Edit text. Keep supported connectors connected.
              </p>
            </div>
            <div>
              <span className="state-label">Know the limits</span>
              <h3>Not every detail transfers</h3>
              <p>
                Some formatting is simplified. Unsupported elements are
                reported. Always keep your original board.
              </p>
            </div>
            <div>
              <span className="state-label">Join in</span>
              <h3>Your board helps</h3>
              <p>
                Found something broken? Report it or help improve a conversion.
              </p>
            </div>
          </div>
          <p className="status-boundary">
            An early release with a verified subset of conversions. Freeform 4.5
            version-7 boards are not generally supported: only tested tables and
            single-object image/text captures with complete sidecars are
            recovered. Keep your original board and review the conversion
            report.
          </p>
          <details className="support-notes">
            <summary>Known limitations</summary>
            <p>
              Tested Freeform 4.5 captures include editable tables, colors,
              borders and attached text. Other version-7 layouts remain limited.
              Verified image masks are preserved; shadow blur is approximate.
              Text stays editable, but mixed bold/italic runs are retained as
              metadata rather than displayed exactly.
            </p>
            <p>
              macOS Draw with Pen exports vector shapes. Decoded ink uses
              uniform widths; detected masked ink is omitted with a warning.
              Apple Pencil pressure and erased ink still need iPad-originated
              validation. See{" "}
              <a
                href="https://github.com/royalpinto007/boardeject/issues/20"
                target="_blank"
                rel="noopener noreferrer"
              >
                issue #20 ↗
              </a>
              .
            </p>
            <p>
              Native connectors on version-7 boards and nonidentity native group
              transforms remain unsupported. Image effects stay attached to the
              asset, not separate editing controls. Other crop/transform
              variants are unsupported; some table edges and attachment padding
              are approximated.
            </p>
          </details>
          <div className="contribute-links">
            <a
              className="button"
              href="https://github.com/royalpinto007/boardeject/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              Find a contributor issue ↗
            </a>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/royalpinto007/boardeject/blob/main/docs/fidelity.md"
            >
              Read the support details ↗
            </a>
          </div>
          <p className="support-resources">
            <a
              href="https://github.com/royalpinto007/boardeject#support-matrix"
              target="_blank"
              rel="noopener noreferrer"
            >
              Support matrix ↗
            </a>
            <a
              href="https://github.com/royalpinto007/boardeject#run-locally"
              target="_blank"
              rel="noopener noreferrer"
            >
              Run locally ↗
            </a>
          </p>
          <details className="support-notes archive-preview">
            <summary>Local Freeform Archive · experimental</summary>
            <p>
              Creates a local, verifiable archive of your Freeform board and
              original assets. Restore back into Apple Freeform is not supported
              yet.
            </p>
            <p>
              Genuine Freeform 4.5 validation now covers read-only snapshots,
              one-board extraction, original image, PDF, video and file bytes,
              verified board titles, and independent SHA-256 verification. The
              experimental macOS flow can scan, create and verify an archive.
              Database-to-Excalidraw conversion remains unavailable because
              native records are not Freeform clipboard envelopes, so no archive
              compatibility is advertised yet.
            </p>
            <a
              href="https://github.com/royalpinto007/boardeject/blob/main/docs/local-archive.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the development status ↗
            </a>
          </details>
        </section>
        <footer className="site-footer">
          <div>
            <a href="/" className="brand">
              BoardEject
              <span className="footer-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
            <p>Your board. Your format.</p>
          </div>
          <div className="footer-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://github.com/royalpinto007/boardeject"
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
          <p className="footer-disclaimer">
            Independent open-source project. Not affiliated with Apple or
            Excalidraw.
          </p>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  /^\/test-capture\/?$/.test(location.pathname) ? (
    <Suspense fallback={<p role="status">Opening Capture Tester…</p>}>
      <CaptureTester />
    </Suspense>
  ) : (
    <App />
  ),
);
