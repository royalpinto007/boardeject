import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type {
  createFreeformArchive,
  scanFreeformBoards,
  verifyFreeformArchive,
} from "../../scripts/archive-freeform.ts";

export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_PORT = 48117;
const API_VERSION = 1;
const JSON_LIMIT = 64 * 1024;
const ARCHIVE_LIMIT = 1024 * 1024 * 1024;
const DEFAULT_ORIGINS = new Set([
  "https://boardeject.dev",
  "http://127.0.0.1:5190",
  "http://localhost:5190",
  "http://127.0.0.1:4190",
  "http://localhost:4190",
]);

export interface BridgeOptions {
  host?: string;
  port?: number;
  allowedOrigins?: ReadonlySet<string>;
  scan: typeof scanFreeformBoards;
  create: typeof createFreeformArchive;
  verify: typeof verifyFreeformArchive;
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function setCors(response: ServerResponse, origin: string) {
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-BoardEject-Token",
  );
  response.setHeader("Access-Control-Allow-Private-Network", "true");
  response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin");
}

function json(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function readBody(request: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit)
      throw new HttpError(413, "The local request is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function parseJson(bytes: Buffer) {
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "The request body is not valid JSON.");
  }
}

function safeFilename(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 96);
  return `${normalized || "Freeform-board"}.boardejectarchive`;
}

function publicError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The helper could not complete the request.";
  if (message.includes("ENOENT") || message.includes("No such file")) {
    return "Freeform data was not found on this Mac. Open Freeform once, then try again.";
  }
  if (
    message.includes("permission") ||
    message.includes("Operation not permitted")
  ) {
    return "BoardEject cannot read Freeform yet. Allow file access in System Settings, then try again.";
  }
  return message;
}

export function createBridgeServer(options: BridgeOptions) {
  const host = options.host ?? BRIDGE_HOST;
  const port = options.port ?? BRIDGE_PORT;
  const origins = options.allowedOrigins ?? DEFAULT_ORIGINS;
  const scan = options.scan;
  const create = options.create;
  const verify = options.verify;
  const token = randomBytes(32).toString("base64url");

  const server = createServer(async (request, response) => {
    try {
      const origin = request.headers.origin;
      if (!origin || !origins.has(origin))
        throw new HttpError(403, "Origin not allowed.");
      const address = server.address();
      const activePort =
        typeof address === "object" && address ? address.port : port;
      const expectedHost = new Set([
        `${host}:${activePort}`,
        `localhost:${activePort}`,
      ]);
      if (!request.headers.host || !expectedHost.has(request.headers.host)) {
        throw new HttpError(403, "Host not allowed.");
      }
      setCors(response, origin);
      if (request.method === "OPTIONS") {
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      if (request.method === "GET" && url.pathname === "/v1/status") {
        json(response, 200, {
          service: "boardeject-local-helper",
          apiVersion: API_VERSION,
          token,
          localOnly: true,
        });
        return;
      }
      if (request.headers["x-boardeject-token"] !== token) {
        throw new HttpError(
          401,
          "Reconnect to the local helper and try again.",
        );
      }
      if (request.method === "POST" && url.pathname === "/v1/boards/scan") {
        json(response, 200, await scan());
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/archives/create") {
        if (!request.headers["content-type"]?.startsWith("application/json")) {
          throw new HttpError(415, "Expected a JSON request.");
        }
        const payload = parseJson(await readBody(request, JSON_LIMIT));
        if (
          !payload ||
          typeof payload !== "object" ||
          !("boardId" in payload) ||
          typeof payload.boardId !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(payload.boardId)
        ) {
          throw new HttpError(400, "Choose a valid Freeform board.");
        }
        const title =
          "title" in payload && typeof payload.title === "string"
            ? payload.title.slice(0, 250)
            : undefined;
        const bytes = await create(payload.boardId, title);
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "application/vnd.boardeject.archive",
          "Content-Disposition": `attachment; filename="${safeFilename(title ?? "Freeform-board")}"`,
          "Content-Length": bytes.byteLength,
          "X-Content-Type-Options": "nosniff",
        });
        response.end(bytes);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/archives/verify") {
        if (
          !request.headers["content-type"]?.startsWith(
            "application/vnd.boardeject.archive",
          )
        ) {
          throw new HttpError(
            415,
            "Choose a .boardejectarchive file to verify.",
          );
        }
        const report = await verify(await readBody(request, ARCHIVE_LIMIT));
        json(response, report.valid ? 200 : 422, report);
        return;
      }
      throw new HttpError(404, "Local helper endpoint not found.");
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      json(response, status, { error: publicError(error) });
    }
  });

  return {
    host,
    port,
    token,
    server,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
