import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridgeServer } from "../apps/local-bridge/server.ts";

const origin = "https://boardeject.dev";
const archive = new TextEncoder().encode("verified-local-archive");
const instances: ReturnType<typeof createBridgeServer>[] = [];

async function start(
  overrides: Partial<Parameters<typeof createBridgeServer>[0]> = {},
) {
  const defaults: Parameters<typeof createBridgeServer>[0] = {
    scan: vi.fn(async () => ({
      format: "boardeject.freeform-catalog" as const,
      boards: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          displayName: "Product planning",
          titleStatus: "verified" as const,
          objectCount: 37,
          assetReferenceCount: 8,
        },
      ],
      warnings: [],
    })),
    capture: vi.fn(async () =>
      JSON.stringify({
        format: "boardeject.clipboard",
        version: 1,
        flavors: [{ uti: "com.apple.freeform.CRLNativeData", base64: "AQ==" }],
      }),
    ),
    create: vi.fn(async () => archive),
    verify: vi.fn(async () => ({
      valid: true,
      filesChecked: 10,
      assetsVerified: 8,
      missing: 0,
      corrupted: 0,
      errors: [],
      warnings: [],
    })),
  };
  const bridge = createBridgeServer({
    ...defaults,
    host: "127.0.0.1",
    port: 0,
    allowedOrigins: new Set([origin]),
    ...overrides,
  });
  await bridge.listen();
  instances.push(bridge);
  const address = bridge.server.address();
  if (!address || typeof address === "string")
    throw new Error("No bridge address");
  return { bridge, url: `http://127.0.0.1:${address.port}` };
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map((bridge) => bridge.close()));
});

async function connect(url: string) {
  const response = await fetch(`${url}/v1/status`, {
    headers: { Origin: origin },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { token: string };
}

describe("localhost bridge", () => {
  it("binds locally, reports status, and scans through an authenticated session", async () => {
    const { bridge, url } = await start();
    const status = await connect(url);
    expect(bridge.host).toBe("127.0.0.1");
    const response = await fetch(`${url}/v1/boards/scan`, {
      method: "POST",
      headers: { Origin: origin, "X-BoardEject-Token": status.token },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      boards: [{ displayName: "Product planning", objectCount: 37 }],
    });
  });

  it("creates archive bytes and verifies them without uploading anywhere", async () => {
    const { url } = await start();
    const { token } = await connect(url);
    const created = await fetch(`${url}/v1/archives/create`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-BoardEject-Token": token,
      },
      body: JSON.stringify({
        boardId: "11111111-1111-1111-1111-111111111111",
        title: "Product planning",
      }),
    });
    expect(new Uint8Array(await created.arrayBuffer())).toEqual(archive);
    expect(created.headers.get("content-disposition")).toContain(
      "Product-planning.boardejectarchive",
    );
    const verified = await fetch(`${url}/v1/archives/verify`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/vnd.boardeject.archive",
        "X-BoardEject-Token": token,
      },
      body: archive,
    });
    expect(await verified.json()).toMatchObject({
      valid: true,
      filesChecked: 10,
    });
  });

  it("captures the current Freeform clipboard only through an authenticated explicit request", async () => {
    const capture = vi.fn(async () =>
      JSON.stringify({
        format: "boardeject.clipboard",
        version: 1,
        flavors: [{ uti: "com.apple.freeform.CRLNativeData", base64: "AQ==" }],
      }),
    );
    const { url } = await start({ capture });

    expect(
      (
        await fetch(`${url}/v1/clipboard/capture`, {
          method: "POST",
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(401);
    expect(capture).not.toHaveBeenCalled();

    const { token } = await connect(url);
    const response = await fetch(`${url}/v1/clipboard/capture`, {
      method: "POST",
      headers: { Origin: origin, "X-BoardEject-Token": token },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/vnd.boardeject.clipboard+json",
    );
    expect(await response.json()).toMatchObject({
      format: "boardeject.clipboard",
      version: 1,
    });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("rejects foreign origins, DNS rebinding hosts, and unauthenticated writes", async () => {
    const { url } = await start();
    expect(
      (
        await fetch(`${url}/v1/status`, {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${url}/v1/boards/scan`, {
          method: "POST",
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(401);
  });

  it("fails malformed create requests cleanly", async () => {
    const { url } = await start();
    const { token } = await connect(url);
    const response = await fetch(`${url}/v1/archives/create`, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-BoardEject-Token": token,
      },
      body: JSON.stringify({ boardId: "not-a-uuid" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Choose a valid Freeform board.",
    });
  });
});
