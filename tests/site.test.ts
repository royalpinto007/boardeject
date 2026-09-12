import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public website essentials", () => {
  const html = readFileSync("apps/web/index.html", "utf8");
  const asset = (name: string) => `apps/web/public/${name}`;
  it("ships linked icons, a manifest and crawler files", () => {
    for (const name of [
      "favicon.svg",
      "favicon.ico",
      "apple-touch-icon.png",
      "site.webmanifest",
    ]) {
      expect(html).toContain(`/${name}`);
      expect(existsSync(asset(name))).toBe(true);
    }
    const manifest = JSON.parse(
      readFileSync(asset("site.webmanifest"), "utf8"),
    );
    for (const icon of manifest.icons)
      expect(existsSync(asset(icon.src.slice(1)))).toBe(true);
    expect(readFileSync(asset("robots.txt"), "utf8")).toContain(
      "https://boardeject.dev/sitemap.xml",
    );
    expect(readFileSync(asset("sitemap.xml"), "utf8")).toContain(
      "<loc>https://boardeject.dev/</loc>",
    );
  });
  it("provides server-readable sharing metadata and a 1200 by 630 PNG", () => {
    expect(html).toContain('property="og:image"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain("<noscript>");
    const png = readFileSync(asset("social-preview.png"));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(readFileSync(asset("404.html"), "utf8")).toContain(
      'content="noindex"',
    );
  });
});
