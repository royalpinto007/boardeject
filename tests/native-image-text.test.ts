import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { decodePasteboard } from "libfreeform";
import { normalize } from "../packages/freeform-parser/normalize";
import { embeddedImage } from "../packages/freeform-parser/media";

const root = "tests/fixtures/freeform-4.5/";
const content = (name: string) =>
  JSON.parse(readFileSync(root + name + ".content.json", "utf8"))[0];

it("preserves the native image resource identity and bytes across a move", () => {
  const before = content("image-baseline"),
    after = content("image-moved");
  expect(before.type_identifier).toBe("com.apple.apps.content-language.image");
  expect(before.resource.indirect.encoding_format).toBe("passthrough");
  expect(after.resource.indirect.identifier).toBe(
    before.resource.indirect.identifier,
  );
  expect(before.geometry.size).toMatchObject({ width: 64, height: 48 });
  expect(after.geometry.position.x - before.geometry.position.x).toBe(11);
  expect(after.geometry.position.y).toBe(before.geometry.position.y);
  const original = readFileSync(root + "image-baseline.resource.png");
  expect(readFileSync(root + "image-moved.resource.png")).toEqual(original);
  expect(embeddedImage(original)?.mimeType).toBe("image/png");
  // The original pixels do not include these Freeform appearance effects.
  expect(before.mask.path.primary_case).toBe("bezier");
  expect(before.shadow.primary_case).toBe("dropShadow");
});

it("retains genuine plain, bold and mixed text run boundaries", () => {
  for (const name of ["text-plain", "text-bold", "text-mixed"]) {
    const runs = content(name).text.attributed_string;
    expect(runs.filter((v: unknown) => typeof v === "string").join("")).toBe(
      "Plain Bold Italic",
    );
    expect(
      runs
        .filter((v: unknown) => typeof v !== "string")
        .every((v: any) => typeof v.NSFont === "string"),
    ).toBe(true);
  }
  const mixed = content("text-mixed").text.attributed_string;
  expect([mixed[0], mixed[2], mixed[4]]).toEqual(["Plain ", "Bold ", "Italic"]);
  expect(
    Buffer.from(mixed[3].NSFont, "base64").includes(
      Buffer.from("Helvetica-Bold"),
    ),
  ).toBe(true);
  expect(
    Buffer.from(mixed[5].NSFont, "base64").includes(
      Buffer.from("Helvetica-Oblique"),
    ),
  ).toBe(true);
  expect(content("text-plain").text.attributed_string[1].NSFont).not.toBe(
    content("text-bold").text.attributed_string[1].NSFont,
  );
});

it.each([
  "image-baseline",
  "image-moved",
  "text-plain",
  "text-bold",
  "text-mixed",
])("does not claim complete native conversion for %s", (name) => {
  const flavors = [
    {
      uti: "com.apple.freeform.CRLNativeData",
      bytes: readFileSync(root + name + ".crlnative"),
    },
    {
      uti: "com.apple.apps.content-language.canvas-object-1.0",
      bytes: readFileSync(root + name + ".content.json"),
    },
  ];
  if (name.startsWith("image"))
    flavors.push({
      uti: content(name).resource.indirect.identifier,
      bytes: readFileSync(root + name + ".resource.png"),
    });
  const board = normalize(decodePasteboard({ flavors }));
  expect(board.nodes).toHaveLength(0);
  expect(board.issues.some((i) => i.severity === "unsupported")).toBe(true);
});
