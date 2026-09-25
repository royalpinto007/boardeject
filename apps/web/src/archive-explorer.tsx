import { useEffect, useRef, useState } from "react";
import {
  EXPLORER_MAX_BYTES,
  safeDownloadName,
  type ExplorerResult,
  type ExplorerAsset,
} from "../../../packages/archive/explorer";
import "./archive-explorer.css";

function save(
  bytes: Uint8Array,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = safeDownloadName(name);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function size(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
}
function Media({
  bytes,
  type,
  name,
}: {
  bytes: Uint8Array;
  type: string;
  name: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [bytes, type]);
  if (!url) return null;
  if (type.startsWith("image/"))
    return <img src={url} alt={name} loading="lazy" />;
  if (type.startsWith("video/"))
    return <video src={url} controls preload="metadata" aria-label={name} />;
  if (type.startsWith("audio/"))
    return <audio src={url} controls preload="metadata" aria-label={name} />;
  return (
    <iframe src={url} title={name} sandbox="" referrerPolicy="no-referrer" />
  );
}
function Asset({ asset }: { asset: ExplorerAsset }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="archive-asset">
      <div className="archive-asset-info">
        <span aria-hidden="true" className="archive-file-icon">
          {asset.previewType?.startsWith("image/")
            ? "▧"
            : asset.previewType?.startsWith("video/")
              ? "▷"
              : "▤"}
        </span>
        <div>
          <strong>{asset.name}</strong>
          <small>
            {asset.bytes ? size(asset.bytes.length) : "Original file missing"}
            {asset.status === "duplicate" ? " · Shared original" : ""}
          </small>
        </div>
      </div>
      <div className="archive-asset-actions">
        {asset.bytes && asset.previewType && (
          <button
            className="text-button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide preview" : "Preview"}
          </button>
        )}
        {asset.bytes && (
          <button
            className="text-button"
            onClick={() => save(asset.bytes!, asset.name)}
            aria-label={`Download ${asset.name}`}
          >
            Download ↓
          </button>
        )}
      </div>
      {expanded && asset.bytes && asset.previewType && (
        <div className="archive-media">
          <Media
            bytes={asset.bytes}
            type={asset.previewType}
            name={asset.name}
          />
          {asset.previewType === "application/pdf" && (
            <small>
              If your browser cannot display this PDF, download it to view.
            </small>
          )}
        </div>
      )}
    </li>
  );
}

export default function ArchiveExplorer() {
  const [result, setResult] = useState<ExplorerResult>();
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const task = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  function stop() {
    task.current?.terminate();
    task.current = null;
    clearTimeout(timer.current);
  }
  function getWorker() {
    if (!task.current)
      task.current = new Worker(
        new URL("./archive-worker.ts", import.meta.url),
        { type: "module" },
      );
    return task.current;
  }
  useEffect(() => {
    document.title = "Open a Freeform archive | BoardEject";
    getWorker();
    return () => {
      sequence.current++;
      stop();
    };
  }, []);
  async function open(files: File[]) {
    const id = ++sequence.current;
    clearTimeout(timer.current);
    setResult(undefined);
    setError("");
    setBusy(false);
    setExtracting(false);
    if (files.length !== 1) {
      setError("Choose one .boardejectarchive file.");
      return;
    }
    const selected = files[0];
    setFile(selected);
    if (selected.size > EXPLORER_MAX_BYTES) {
      setError(
        "This archive exceeds 256 MiB. Use the Mac helper to verify larger archives.",
      );
      return;
    }
    setBusy(true);
    try {
      const bytes = await selected.arrayBuffer();
      if (id !== sequence.current) return;
      const worker = getWorker();
      const fail = (message: string) => {
        if (id !== sequence.current) return;
        stop();
        setBusy(false);
        setError(message);
      };
      timer.current = setTimeout(
        () =>
          fail(
            "Verification took too long. Try a smaller archive or verify with the Mac helper.",
          ),
        60000,
      );
      worker.onerror = () =>
        fail("Could not verify this archive. Try reopening it.");
      worker.onmessage = ({ data }) => {
        if (id !== sequence.current || data.id !== id) return;
        clearTimeout(timer.current);
        setBusy(false);
        setExtracting(false);
        if (data.error) setError(data.error);
        else if (data.zip)
          save(
            data.zip,
            `${selected.name.replace(/\.boardejectarchive$/i, "")}-assets.zip`,
            "application/zip",
          );
        else setResult(data.result);
        requestAnimationFrame(() => heading.current?.focus());
      };
      worker.postMessage({ id, bytes }, [bytes]);
    } catch {
      if (id === sequence.current) {
        stop();
        setBusy(false);
        setError("This file could not be read. Choose it again.");
      }
    }
  }
  const report = result?.verification;
  const manifest = report?.valid ? report.manifest : undefined;
  return (
    <>
      <a className="skip-link" href="#explorer" tabIndex={0}>
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/">
          <img src="/favicon.svg" width="30" height="30" alt="" />
          BoardEject
        </a>
        <nav aria-label="Main navigation">
          <a href="/#export">Export</a>
          <a href="/#archive">Archive</a>
          <a href="/mac-helper">Mac helper</a>
        </nav>
      </header>
      <main className="landing archive-explorer" id="explorer">
        <section className="archive-intro">
          <p className="eyebrow">Archive Explorer</p>
          <h1>Your board, unpacked.</h1>
          <p>Open an archive. Verify it. Get your original files.</p>
          <small>On this device. No uploads or Mac required.</small>
        </section>
        <section
          className={`archive-drop ${dragging ? "is-dragging" : ""}`}
          aria-label="Open archive"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void open(Array.from(e.dataTransfer.files));
          }}
        >
          <label className="button primary archive-choose">
            Choose archive
            <input
              type="file"
              accept=".boardejectarchive"
              aria-label="Choose archive"
              onChange={(e) => {
                void open(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>
          <span>{file?.name || "or drop a .boardejectarchive here"}</span>
          {busy && (
            <div role="status">
              Checking files and integrity…{" "}
              <button
                className="text-button"
                onClick={() => {
                  sequence.current++;
                  stop();
                  setBusy(false);
                  setError(
                    "Verification cancelled. Your file was not changed.",
                  );
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
        {error && (
          <p className="archive-error" role="alert">
            {error}
          </p>
        )}
        {report && (
          <section className="archive-result" aria-label="Archive result">
            <div
              className={`archive-status ${report.valid ? "" : "archive-error"}`}
            >
              <span className="archive-status-icon" aria-hidden="true">
                {report.valid ? "✓" : "!"}
              </span>
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  {report.valid ? "Archive verified" : "Verification failed"}
                </h2>
                <p>
                  {report.valid
                    ? `${report.filesChecked} files intact · ${report.assetsVerified} asset references verified`
                    : "Files cannot be previewed or extracted until integrity checks pass."}
                </p>
              </div>
            </div>
            {!report.valid && (
              <ul role="alert">
                {report.errors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            )}
            {report.warnings.length > 0 && (
              <div className="archive-notice" role="status">
                {report.warnings.join(" ")} Missing originals cannot be
                recovered from this archive.
              </div>
            )}
            {manifest && result && (
              <>
                <div className="archive-board">
                  <div>
                    <p className="eyebrow">Preserved board</p>
                    <h2>{manifest.board.title}</h2>
                    <p>
                      {Number.isFinite(Date.parse(manifest.createdAt))
                        ? new Date(manifest.createdAt).toLocaleString()
                        : "Archive date unavailable"}{" "}
                      · {manifest.board.objectCount} objects
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={extracting || !result.assets.some((a) => a.bytes)}
                    onClick={() => {
                      try {
                        setExtracting(true);
                        task.current?.postMessage({
                          id: sequence.current,
                          extract: true,
                        });
                      } catch {
                        setError(
                          "Could not package the assets. Download individual files instead.",
                        );
                      }
                    }}
                  >
                    {extracting ? "Preparing files…" : "Download all files ↓"}
                  </button>
                </div>
                {result.preview ? (
                  <div className="archive-media archive-board-preview">
                    <Media
                      bytes={result.preview}
                      type="image/png"
                      name="Included board preview"
                    />
                  </div>
                ) : (
                  <p className="archive-caption">
                    No board preview was included. Original files are below.
                  </p>
                )}
                {result.exportBytes ? (
                  <div className="archive-export">
                    <strong>Editable export included</strong>
                    <button
                      className="button secondary"
                      onClick={() =>
                        save(
                          result.exportBytes!,
                          `${manifest.board.title}.excalidraw`,
                          "application/json",
                        )
                      }
                    >
                      Download Excalidraw ↓
                    </button>
                    <small>
                      Open the downloaded file in Excalidraw to edit it.
                    </small>
                  </div>
                ) : (
                  <p className="archive-caption">
                    No editable export included. Native archive records cannot
                    yet be converted to Excalidraw.
                  </p>
                )}
                <h2 className="archive-files-title">
                  Original files <span>{result.assets.length}</span>
                </h2>
                {result.assets.length ? (
                  <ul className="archive-assets">
                    {result.assets.map((asset, i) => (
                      <Asset key={`${sequence.current}-${i}`} asset={asset} />
                    ))}
                  </ul>
                ) : (
                  <p>This board has no referenced assets.</p>
                )}
                <div className="archive-bottom">
                  <button
                    className="text-button"
                    onClick={() => file && void open([file])}
                  >
                    Verify again ↻
                  </button>
                  <details className="technical-details">
                    <summary>View technical details</summary>
                    <p>
                      SHA-256 checks detect changes against the enclosed
                      manifest. They do not authenticate the archive’s author.{" "}
                      {report.missing} missing · {report.corrupted} corrupted.
                    </p>
                    <pre>{JSON.stringify(manifest, null, 2)}</pre>
                  </details>
                </div>
              </>
            )}
          </section>
        )}
        <p className="archive-footnote">
          Need an archive?{" "}
          <a href="/#archive">Create one with the Mac helper →</a>
          <br />
          Restore into Apple Freeform is not supported.
        </p>
        <footer className="site-footer">
          <a href="/" className="brand">
            <img src="/favicon.svg" width="30" height="30" alt="" />
            BoardEject
          </a>
          <div className="footer-links">
            <a href="/support">Support</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a
              href="https://github.com/royalpinto007/boardeject"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code ↗
            </a>
          </div>
        </footer>
      </main>
    </>
  );
}
