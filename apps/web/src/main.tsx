import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { exampleBoard } from "../../../examples/board";
import type { Board } from "../../../packages/board-model/index";
import { convert } from "../../../packages/excalidraw-converter/index";
import "./style.css";
Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/vendor/excalidraw/" });
const Editor = lazy(() => import("./editor"));
const CaptureTester = lazy(() => import("./capture-tester"));

type ArchiveStep =
  "idle" | "boards" | "selected" | "creating" | "created" | "verified";

function ArchiveDemo() {
  const [step, setStep] = useState<ArchiveStep>("idle");
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("archive-demo")) return;
    document.documentElement.classList.add("archive-demo-mode");
    const sequence: Array<[number, ArchiveStep]> = [
      [1200, "boards"],
      [3000, "selected"],
      [4200, "creating"],
      [6500, "created"],
      [9000, "verified"],
    ];
    const timers = sequence.map(([delay, next]) =>
      window.setTimeout(() => setStep(next), delay),
    );
    return () => {
      document.documentElement.classList.remove("archive-demo-mode");
      timers.forEach(window.clearTimeout);
    };
  }, []);
  const choose = () => setStep("selected");
  const create = () => {
    setStep("creating");
    window.setTimeout(() => setStep("created"), 1200);
  };
  return (
    <div className="archive-utility" data-step={step}>
      <div className="utility-topline">
        <span className="utility-light" /> Demo · verified Freeform 4.5 result
        <span className="utility-local">Replay</span>
      </div>
      {step === "idle" && (
        <div className="utility-center">
          <span className="utility-icon" aria-hidden="true">
            ⌁
          </span>
          <h3>Find your Freeform boards</h3>
          <p>The helper reads a stable local copy.</p>
          <button onClick={() => setStep("boards")}>Scan Freeform</button>
        </div>
      )}
      {(step === "boards" || step === "selected") && (
        <div className="utility-content">
          <div className="utility-heading">
            <div>
              <span className="success-mark">✓</span>
              <h3>2 boards found</h3>
            </div>
            <button className="quiet-action" onClick={() => setStep("boards")}>
              Scan again
            </button>
          </div>
          <button
            className={`board-row ${step === "selected" ? "selected" : ""}`}
            onClick={choose}
            aria-pressed={step === "selected"}
          >
            <span className="board-thumb">
              <i />
              <i />
              <i />
            </span>
            <span>
              <strong>Untitled 2</strong>
              <small>Modified today · 7 objects · 7 assets</small>
            </span>
            <span className="radio-mark">{step === "selected" ? "✓" : ""}</span>
          </button>
          <button className="board-row muted" onClick={choose}>
            <span className="board-thumb">
              <i />
              <i />
            </span>
            <span>
              <strong>Untitled 3</strong>
              <small>Modified today · 3 objects</small>
            </span>
            <span className="radio-mark" />
          </button>
          <button disabled={step !== "selected"} onClick={create}>
            Create local backup
          </button>
        </div>
      )}
      {step === "creating" && (
        <div className="utility-content">
          <span className="utility-kicker">Creating Untitled 2</span>
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
            <span className="utility-kicker">Untitled 2.boardejectarchive</span>
          </div>
          <h3>Backup created</h3>
          <p>10 files · 7 assets · 0 missing</p>
          <div className="utility-actions">
            <button className="secondary" disabled>
              Save archive ✓
            </button>
            <button onClick={() => setStep("verified")}>Verify now</button>
          </div>
        </div>
      )}
      {step === "verified" && (
        <div className="utility-content result-state">
          <div className="result-label">
            <span className="result-icon">✓</span>
            <span className="utility-kicker">Untitled 2.boardejectarchive</span>
          </div>
          <h3>Archive verified</h3>
          <div className="proof-grid">
            <span>
              <strong>10/10</strong> files intact
            </span>
            <span>
              <strong>7/7</strong> assets verified
            </span>
          </div>
          <p>No missing or corrupted files.</p>
          <button className="quiet-action" onClick={() => setStep("idle")}>
            Start again
          </button>
        </div>
      )}
      <p className="utility-disclosure">
        Demo only. Install the macOS helper to back up your own boards.
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
        <section className="hero product-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="preview-badge">
              <span /> Open source · v0.0.3
            </span>
            <h1 id="hero-title">
              Your Freeform boards, <span>actually yours.</span>
            </h1>
            <p className="intro">
              Keep editing in Excalidraw, or make a verified local backup with
              the original assets.
            </p>
            <div className="actions hero-actions">
              <a className="button" href="#export">
                Export to Excalidraw <span>↗</span>
              </a>
              <a className="button secondary" href="#archive">
                Back up a board <span>↓</span>
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
              <p>Freeform capture → editable Excalidraw.</p>
              <p className="workflow-note">
                <strong>Using your board?</strong> Install the Mac helper, copy
                your Freeform selection, then choose the saved capture here.
              </p>
              <div className="actions">
                <button onClick={example} disabled={busy}>
                  Try browser demo <span>↗</span>
                </button>
                <button
                  className="secondary"
                  onClick={() => file.current?.click()}
                  disabled={busy}
                >
                  Choose capture
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
                  if (selected.size > 45 * 1024 * 1024)
                    setStatus("Capture exceeds 45 MiB.");
                  else parse(await selected.text());
                  event.target.value = "";
                }}
              />
              <button
                className="text-button clipboard-action"
                onClick={clipboard}
                disabled={busy}
              >
                Use copied BoardEject capture
              </button>
              <p role="status" className="status">
                {status}
              </p>
              <a className="helper-link" href="/mac-helper">
                Set up the macOS helper →
              </a>
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
              <span className="state-label">Local Backup / Archive · Demo</span>
              <h2>One board. Original files. Verified.</h2>
              <p>Freeform → local `.boardejectarchive`.</p>
              <p className="workflow-note">
                <strong>This panel is a demo.</strong> Real backups use the
                macOS helper because a website cannot read Freeform's local
                database.
              </p>
              <div className="actions">
                <a className="button" href="/mac-helper">
                  Set up the Mac helper <span>→</span>
                </a>
                <button
                  className="secondary"
                  onClick={() =>
                    document
                      .querySelector<HTMLElement>("#archive .archive-utility")
                      ?.scrollIntoView({ block: "center", behavior: "smooth" })
                  }
                >
                  Try the demo
                </button>
              </div>
              <p className="fine">
                Freeform 4.5 verified. Restore is not supported.
              </p>
            </div>
            <ArchiveDemo />
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
            <small>Edit the export. Verify the backup.</small>
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
            <span className="preview-badge">Current status · v0.0.3</span>
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
              Local backup supports the exact verified Freeform 4.5 schema.
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
              BoardEject
              <span className="footer-arrow" aria-hidden="true">
                ↗
              </span>
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
  /^\/test-capture\/?$/.test(location.pathname) ? (
    <Suspense fallback={<p role="status">Opening Capture Tester…</p>}>
      <CaptureTester />
    </Suspense>
  ) : (
    <App />
  ),
);
