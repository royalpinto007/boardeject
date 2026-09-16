export const LOCAL_HELPER_URL = "http://127.0.0.1:48117/v1";

export interface LocalBoard {
  id: string;
  displayName: string;
  titleStatus: "verified" | "unverified";
  modifiedAt?: number;
  objectCount: number;
  assetReferenceCount: number;
}

export interface LocalCatalog {
  format: "boardeject.freeform-catalog";
  boards: LocalBoard[];
  warnings: string[];
}

export interface LocalVerification {
  valid: boolean;
  filesChecked: number;
  assetsVerified: number;
  missing: number;
  corrupted: number;
  errors: string[];
  warnings: string[];
}

export interface CreatedArchive {
  bytes: Blob;
  filename: string;
}

export class LocalHelperError extends Error {
  constructor(
    message: string,
    readonly kind: "unavailable" | "request",
  ) {
    super(message);
  }
}

async function request(
  path: string,
  init: RequestInit = {},
  timeout = 120_000,
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${LOCAL_HELPER_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new LocalHelperError(
        body.error ?? `The helper returned ${response.status}.`,
        "request",
      );
    }
    return response;
  } catch (error) {
    if (error instanceof LocalHelperError) throw error;
    throw new LocalHelperError(
      error instanceof DOMException && error.name === "AbortError"
        ? "The helper took too long. Open it and try again."
        : "The Mac helper is not running on this device.",
      "unavailable",
    );
  } finally {
    window.clearTimeout(timer);
  }
}

function filename(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  return (
    disposition.match(/filename="([^"]+)"/)?.[1] ??
    "Freeform-board.boardejectarchive"
  );
}

export async function connectLocalHelper() {
  const response = await request("/status", {}, 2_500);
  const status = (await response.json()) as {
    service?: string;
    apiVersion?: number;
    token?: string;
    localOnly?: boolean;
  };
  if (
    status.service !== "boardeject-local-helper" ||
    status.apiVersion !== 1 ||
    !status.token ||
    status.localOnly !== true
  ) {
    throw new LocalHelperError(
      "This helper version is not compatible with BoardEject.",
      "request",
    );
  }
  const headers = { "X-BoardEject-Token": status.token };
  return {
    async capture(): Promise<string> {
      const result = await request("/clipboard/capture", {
        method: "POST",
        headers,
      });
      return result.text();
    },
    async scan(): Promise<LocalCatalog> {
      const result = await request("/boards/scan", { method: "POST", headers });
      return result.json() as Promise<LocalCatalog>;
    },
    async create(board: LocalBoard): Promise<CreatedArchive> {
      const result = await request("/archives/create", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id, title: board.displayName }),
      });
      return { bytes: await result.blob(), filename: filename(result) };
    },
    async verify(archive: Blob): Promise<LocalVerification> {
      const result = await request("/archives/verify", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/vnd.boardeject.archive",
        },
        body: archive,
      });
      return result.json() as Promise<LocalVerification>;
    },
  };
}

export type LocalHelper = Awaited<ReturnType<typeof connectLocalHelper>>;

export function saveArchive(archive: CreatedArchive) {
  const url = URL.createObjectURL(archive.bytes);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = archive.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
