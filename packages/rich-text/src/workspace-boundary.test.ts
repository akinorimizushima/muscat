// @vitest-environment node

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../..");

describe("rich-text workspace ownership", () => {
  it("documents the public adapter and private Tiptap boundary", async () => {
    const readme = await readFile(join(workspaceRoot, "README.md"), "utf8");

    expect(readme).toContain("`@muscat/rich-text`");
    expect(readme).toContain("Tiptap is a private implementation detail");
    expect(readme).toContain("demo consumes only Muscat-owned APIs");
  });

  it("keeps editor-library dependencies and imports in the rich-text package", async () => {
    const manifestPaths = [
      "apps/demo/package.json",
      "packages/core/package.json",
      "packages/dom/package.json",
      "packages/rich-text/package.json",
    ];
    const manifests = await Promise.all(
      manifestPaths.map(
        async (path) => [path, await readFile(join(workspaceRoot, path), "utf8")] as const,
      ),
    );
    const owners = manifests
      .filter(([, source]) => /"@(?:tiptap|floating-ui)\//.test(source))
      .map(([path]) => path);
    expect(owners).toEqual(["packages/rich-text/package.json"]);

    const outsideSourceDirectories = ["apps/demo/src", "packages/core/src", "packages/dom/src"];
    const sourcePaths = (
      await Promise.all(
        outsideSourceDirectories.map(async (directory) =>
          (await readdir(join(workspaceRoot, directory), { recursive: true }))
            .filter((path) => path.endsWith(".ts"))
            .map((path) => join(directory, path)),
        ),
      )
    ).flat();
    const imports = await Promise.all(
      sourcePaths.map(
        async (path) => [path, await readFile(join(workspaceRoot, path), "utf8")] as const,
      ),
    );
    const forbiddenImports = imports
      .filter(([, source]) => /from "@(?:tiptap|floating-ui)\//.test(source))
      .map(([path]) => path);
    expect(forbiddenImports).toEqual([]);
    expect(await readFile(join(workspaceRoot, "apps/demo/src/main.ts"), "utf8")).toContain(
      'from "@muscat/rich-text"',
    );
  });
});
