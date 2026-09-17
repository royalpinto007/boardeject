import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { exampleBoard } from "../../../examples/board";
import type { Board } from "../../../packages/board-model/index";
import { convert } from "../../../packages/excalidraw-converter/index";
import CaptureTester from "./capture-tester";
import {
  connectLocalHelper,
  type CreatedArchive,
  type LocalBoard,
  type LocalHelper,
  type LocalVerification,
  saveArchive,
} from "./local-helper";
import "./style.css";
Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/vendor/excalidraw/" });
const Editor = lazy(() => import("./editor"));

type ArchiveStep =
  | "connecting"
  | "offline"
  | "ready"
  | "scanning"
  | "boards"
  | "creating"
  | "created"
  | "verifying"
  | "verified"
  | "error";

function LocalArchive() {
  const connectionPending = useRef(false);
  const autoConnectStarted = useRef(false);
  const [step, setStep] = useState<ArchiveStep>("offline");
  const [helper, setHelper] = useState<LocalHelper>();
  const [boards, setBoards] = useState<LocalBoard[]>([]);
  const [selected, setSelected] = useState<LocalBoard>();
  const [archive, setArchive] = useState<CreatedArchive>();
  const [verification, setVerification] = useState<LocalVerification>();
  const [message, setMessage] = useState("");

  async function connect(retry = true) {
    if (connectionPending.current) return;
    connectionPending.current = true;
    setStep("connecting");
    setMessage("");
    try {
      const attempts = retry ? 12 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const connected = await connectLocalHelper();
          setHelper(connected);
          setStep("ready");
          return;
        } catch {
          if (attempt + 1 < attempts)
            await new Promise((resolve) => window.setTimeout(resolve, 750));
        }
      }
      setHelper(undefined);
      setStep("offline");
    } finally {
      connectionPending.current = false;
    }
  }

  useEffect(() => {
    const activate = () => {
      if (window.location.hash === "#archive" && !autoConnectStarted.current) {
        autoConnectStarted.current = true;
        void connect();
      }
    };
    window.addEventListener("hashchange", activate);
    const timer = window.setTimeout(activate, 350);
    return () => {
      window.removeEventListener("hashchange", activate);
      window.clearTimeout(timer);
    };
  }, []);

  async function scan() {
    if (!helper) return connect();
    setStep("scanning");
    setMessage("");
    try {
      const catalog = await helper.scan();
      setBoards(catalog.boards);
      setSelected(undefined);
      setStep("boards");
      if (!catalog.boards.length)
        setMessage("No Freeform boards were found on this Mac.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Freeform could not be scanned.",
      );
      setStep("error");
    }
  }

  async function create() {
    if (!helper || !selected) return;
    setStep("creating");
    setMessage("");
    try {
      setArchive(await helper.create(selected));
      setStep("created");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The archive could not be created.",
      );
      setStep("error");
    }
  }

  async function verify() {
    if (!helper || !archive) return;
    setStep("verifying");
    try {
      const report = await helper.verify(archive.bytes);
      setVerification(report);
      setStep(report.valid ? "verified" : "error");
      if (!report.valid) setMessage(report.errors.join(" "));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The archive could not be verified.",
      );
      setStep("error");
    }
  }

  const selectedName = selected?.displayName ?? "Freeform board";
  const helperState =
    step === "connecting"
      ? "Starting"
      : step === "error"
        ? "Error"
        : helper
          ? "Connected"
          : "Not installed / not running";
  return (
    <div className="archive-utility" data-step={step}>
      <div className="utility-topline">
        <span
          className={`utility-light ${helper ? "connected" : ""} ${step === "error" ? "error" : ""}`}
        />
        {helperState}
        <span className="utility-local">On this Mac</span>
      </div>
      {step === "connecting" && (
        <div className="utility-center">
          <span className="utility-icon" aria-hidden="true">
            ⌁
          </span>
          <h3>Starting the helper…</h3>
          <p>Retrying the private connection on this Mac.</p>
        </div>
      )}
      {step === "offline" && (
        <div className="utility-center">
          <span className="utility-icon offline" aria-hidden="true">
            ↓
          </span>
          <h3>Install or open the helper</h3>
          <p>
            Your browser may ask for Local Network Access. This only lets
            boardeject.dev reach BoardEject Helper on this Mac. No board data
            leaves your device.
          </p>
          <div className="utility-actions">
            <a className="button" href="/mac-helper">
              Download helper
            </a>
            <button className="secondary" onClick={() => void connect()}>
              I opened it · connect
            </button>
          </div>
        </div>
      )}
      {step === "ready" && (
        <div className="utility-center">
          <span className="utility-icon success" aria-hidden="true">
            ✓
          </span>
          <h3>Helper connected</h3>
          <p>Freeform stays on this Mac.</p>
          <button onClick={scan}>Scan Freeform</button>
        </div>
      )}
      {step === "scanning" && (
        <div className="utility-center">
          <span className="utility-icon activity" aria-hidden="true" />
          <h3>Scanning Freeform…</h3>
          <p>Making a stable read-only snapshot.</p>
        </div>
      )}
      {step === "boards" && (
        <div className="utility-content">
          <div className="utility-heading">
            <div>
              <span className="success-mark">✓</span>
              <h3>
                {boards.length} {boards.length === 1 ? "board" : "boards"} found
              </h3>
            </div>
            <button className="quiet-action" onClick={scan}>
              Scan again
            </button>
          </div>
          <div className="board-list">
            {boards.map((board) => (
              <button
                key={board.id}
                className={`board-row ${selected?.id === board.id ? "selected" : ""}`}
                onClick={() => setSelected(board)}
                aria-pressed={selected?.id === board.id}
              >
                <span className="board-thumb">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>{board.displayName}</strong>
                  <small>
                    {board.modifiedAt
                      ? `Modified ${new Date(board.modifiedAt * 1000).toLocaleDateString()} · `
                      : ""}
                    {board.objectCount} objects · {board.assetReferenceCount}{" "}
                    assets
                  </small>
                </span>
                <span className="radio-mark">
                  {selected?.id === board.id ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
          {message && <p className="utility-message">{message}</p>}
          <button disabled={!selected} onClick={create}>
            Create local archive
          </button>
        </div>
      )}
      {step === "creating" && (
        <div className="utility-content">
          <span className="utility-kicker">Creating {selectedName}</span>
          <h3>Packaging your board…</h3>
          <ul className="progress-list">
            <li className="done">✓ Board data copied</li>
            <li className="done">✓ Original assets preserved</li>
            <li className="active">
              <span /> Creating integrity hashes
            </li>
            <li>Archive packaged</li>
          </ul>
        </div>
      )}
      {step === "created" && (
        <div className="utility-content result-state">
          <div className="result-label">
            <span className="result-icon">✓</span>
            <span className="utility-kicker">{archive?.filename}</span>
          </div>
          <h3>Archive created</h3>
          <p>Your board and original referenced files are ready.</p>
          <div className="utility-actions">
            <button
              className="secondary"
              onClick={() => archive && saveArchive(archive)}
            >
              Save archive
            </button>
            <button onClick={verify}>Verify now</button>
          </div>
        </div>
      )}
      {step === "verifying" && (
        <div className="utility-center">
          <span className="utility-icon activity" aria-hidden="true" />
          <h3>Verifying archive…</h3>
          <p>Checking every manifest hash locally.</p>
        </div>
      )}
      {step === "verified" && verification && (
        <div className="utility-content result-state">
          <div className="result-label">
            <span className="result-icon">✓</span>
            <span className="utility-kicker">{archive?.filename}</span>
          </div>
          <h3>Archive verified</h3>
          <div className="proof-grid">
            <span>
              <strong>{verification.filesChecked}</strong> files intact
            </span>
            <span>
              <strong>{verification.assetsVerified}</strong> assets verified
            </span>
          </div>
          <p>No missing or corrupted files.</p>
          <div className="utility-actions">
            <button
              className="secondary"
              onClick={() => archive && saveArchive(archive)}
            >
              Save archive
            </button>
            <button className="quiet-action" onClick={scan}>
              Another board
            </button>
          </div>
        </div>
      )}
      {step === "error" && (
        <div className="utility-center error-state">
          <span className="utility-icon offline" aria-hidden="true">
            !
          </span>
          <h3>That did not work</h3>
          <p>{message}</p>
          <button onClick={() => void connect()}>Reconnect helper</button>
        </div>
      )}
      <p className="utility-disclosure">
        Local only. The live Freeform database is never modified.
      </p>
    </div>
  );
}

function App() {
  const [board, setBoard] = useState<Board>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  function example() {
    setBoard(exampleBoard);
    setStatus("Demo loaded. Move a shape or edit text to see the result.");
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
  async function importCopiedSelection() {
    setBusy(true);
    setStatus("Connecting to the Mac helper…");
    try {
      const helper = await connectLocalHelper();
      setStatus("Helper connected. Reading your copied selection…");
      parse(await helper.capture());
    } catch (error) {
      setBusy(false);
      setStatus(
        error instanceof Error
          ? error.message
          : "The copied Freeform selection could not be imported.",
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
      <header className="site-header">
        <a href="/" className="brand">
          <img src="/favicon.svg" width="30" height="30" alt="" /> BoardEject
        </a>
        <nav aria-label="Main navigation">
          <a href="/mac-helper">Mac helper</a>
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
        <section className="hero product-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="preview-badge">
              <span /> Open source · v0.0.4
            </span>
            <h1 id="hero-title">
              Your Freeform boards, <span>actually yours.</span>
            </h1>
            <p className="intro">
              Keep editing in Excalidraw, or make a verified local archive with
              the original assets.
            </p>
            <div className="actions hero-actions">
              <a className="button" href="#export">
                Export to Excalidraw <span>↗</span>
              </a>
              <a className="button secondary" href="#archive">
                Archive a board <span>↓</span>
              </a>
            </div>
            <p className="hero-note">Runs locally. No account. No uploads.</p>
          </div>
          <div className="hero-proof" aria-label="BoardEject output choices">
            <div className="hero-file hero-file-source">
              <span>Freeform</span>
              <strong>Project plan</strong>
              <small>18 objects</small>
            </div>
            <span className="hero-arrow">→</span>
            <div className="hero-outputs">
              <div className="hero-file">
                <span>Editable</span>
                <strong>.excalidraw</strong>
                <small>Keep working</small>
              </div>
              <div className="hero-file">
                <span>Verified</span>
                <strong>.boardejectarchive</strong>
                <small>Keep the originals</small>
              </div>
            </div>
          </div>
        </section>

        <section
          className="choice-grid"
          aria-label="Choose a BoardEject workflow"
        >
          <article className="product-card" id="export">
            <span className="card-number">01</span>
            <div className="product-card-copy">
              <span className="state-label">Editable Export</span>
              <h2>Move it. Edit it. Keep going.</h2>
              <p>Freeform clipboard → editable Excalidraw.</p>
              <p className="workflow-note">
                <strong>Copy in Freeform.</strong> The helper reads that
                selection only when you click Import.
              </p>
              <div className="actions">
                <button onClick={importCopiedSelection} disabled={busy}>
                  {busy ? "Importing…" : "Import copied selection"}
                </button>
                <button className="secondary" onClick={example} disabled={busy}>
                  Try example <span>↗</span>
                </button>
              </div>
              <p role="status" className="status">
                {status}
              </p>
              <a className="helper-link" href="/mac-helper">
                Set up the macOS helper →
              </a>
              <details className="capture-fallback">
                <summary>Capture-file fallback</summary>
                <p>For development or an existing private capture.</p>
                <button
                  className="secondary"
                  onClick={() => file.current?.click()}
                  disabled={busy}
                >
                  Choose capture file
                </button>
                <input
                  hidden
                  ref={file}
                  type="file"
                  accept=".boardeject,application/json"
                  onChange={async (event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;
                    if (selected.size > 45 * 1024 * 1024)
                      setStatus("Capture exceeds 45 MiB.");
                    else parse(await selected.text());
                    event.target.value = "";
                  }}
                />
              </details>
            </div>
            <figure className="demo compact-demo" id="demo">
              <video
                controls
                muted
                playsInline
                preload="metadata"
                poster="/media/demo-poster.png"
                aria-label="Demo: moving a card, following connectors, and editing text in Excalidraw"
              >
                <source src="/media/demo.mp4" type="video/mp4" />
              </video>
              <figcaption>
                <strong>A shape moves. Its arrow follows.</strong>
                <span>Actual BoardEject output · Example board</span>
              </figcaption>
            </figure>
          </article>

          <article className="product-card archive-card" id="archive">
            <span className="card-number">02</span>
            <div className="product-card-copy">
              <span className="state-label">Local Archive</span>
              <h2>One board. Original files. Verified.</h2>
              <p>Freeform → local `.boardejectarchive`.</p>
              <p className="workflow-note">
                <strong>Use your real boards here.</strong> The website connects
                to the helper on this Mac. Nothing is uploaded.
              </p>
              <div className="actions">
                <a className="button" href="/mac-helper">
                  Get the Mac helper <span>→</span>
                </a>
              </div>
              <p className="fine">
                Freeform 4.5 verified. Restore is not supported.
              </p>
            </div>
            <LocalArchive />
          </article>
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
            {board.source !== "synthetic-example" && (
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
            )}
          </section>
        )}
        <section className="trust-strip" aria-label="Privacy guarantees">
          <div>
            <span>◎</span>
            <strong>Stays on your device</strong>
            <small>No board or archive uploads.</small>
          </div>
          <div>
            <span>◇</span>
            <strong>Useful output</strong>
            <small>Edit the export. Verify the archive.</small>
          </div>
          <div>
            <span>↗</span>
            <strong>Open source</strong>
            <small>Inspect every conversion and check.</small>
          </div>
        </section>

        <section
          className="support-compact"
          id="preview-status"
          aria-labelledby="preview-title"
        >
          <div>
            <span className="preview-badge">Current status · v0.0.4</span>
            <h2 id="preview-title">Honest about the edges.</h2>
            <p>
              Supported content stays useful. Anything uncertain appears in the
              result instead of being silently flattened.
            </p>
          </div>
          <details className="technical-details">
            <summary>View technical details</summary>
            <p>
              Editable export supports verified shapes, text, tables, assets,
              ink and connector subsets. Some styling and geometry are
              approximated. Freeform 4.5 version-7 boards are supported only
              through documented fixture-backed paths. Apple Pencil pressure and
              erased ink still need iPad-originated validation in{" "}
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
              Local archive supports the exact verified Freeform 4.5 schema.
              Unknown schemas fail safely. Restore, write-back and iCloud
              manipulation are unavailable. Database-native records are not
              reconstructed into an unverified Excalidraw payload.
            </p>
            <div className="detail-links">
              <a href="/support">Support and limitations →</a>
              <a
                href="https://github.com/royalpinto007/boardeject/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open issues ↗
              </a>
            </div>
          </details>
        </section>
        <footer className="site-footer">
          <div>
            <a href="/" className="brand">
              <img src="/favicon.svg" width="30" height="30" alt="" />
              BoardEject
            </a>
            <p>Your board. Your format.</p>
          </div>
          <div className="footer-links">
            <a href="/mac-helper">Mac helper</a>
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
  /^\/test-capture\/?$/.test(location.pathname) ? <CaptureTester /> : <App />,
);
