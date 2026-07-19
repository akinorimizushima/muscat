// @vitest-environment node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const forbiddenPublicDetails = [
  "@tiptap",
  "prosemirror",
  "Editor",
  "RichTextMenu",
  "RichTextControllerDependencies",
];

async function readReachableDeclarations(entry: string): Promise<Map<string, string>> {
  const declarations = new Map<string, string>();
  const visit = async (file: string): Promise<void> => {
    if (declarations.has(file)) return;
    const source = await readFile(file, "utf8");
    declarations.set(file, source);
    const relativeImports = source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g);
    for (const match of relativeImports) {
      const specifier = match[1];
      if (!specifier) continue;
      await visit(join(dirname(file), `${specifier}.d.ts`));
    }
  };
  await visit(entry);
  return declarations;
}

describe("public declarations", () => {
  it("do not reach implementation or editor-library types", async () => {
    const declarations = await readReachableDeclarations(
      join(import.meta.dirname, "../dist/index.d.ts"),
    );
    const publicGraph = [...declarations.entries()]
      .map(([file, source]) => `${file}\n${source}`)
      .join("\n");

    expect([...declarations.keys()].map((file) => file.split("/").at(-1))).toEqual(["index.d.ts"]);
    for (const forbidden of forbiddenPublicDetails) expect(publicGraph).not.toContain(forbidden);
  });
});
