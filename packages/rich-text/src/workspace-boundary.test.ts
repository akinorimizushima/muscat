// @vitest-environment node

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../..");
const temporaryRoots: string[] = [];

function forbiddenModuleSpecifiers(source: string): string[] {
  const tokens: Array<{ kind: "word" | "string" | "punctuation"; value: string }> = [];
  for (let index = 0; index < source.length;) {
    const character = source[index]!;
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    if (character === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index + 2);
      if (index < 0) break;
      continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index + 2);
      if (index < 0) break;
      index += 2;
      continue;
    }
    if (character === '"' || character === "'") {
      let value = "";
      const quote = character;
      for (index++; index < source.length; index++) {
        const current = source[index]!;
        if (current === "\\") {
          value += source[index + 1] ?? "";
          index++;
        } else if (current === quote) {
          index++;
          break;
        } else value += current;
      }
      tokens.push({ kind: "string", value });
      continue;
    }
    if (character === "`") {
      for (index++; index < source.length; index++) {
        if (source[index] === "\\") index++;
        else if (source[index] === "`") {
          index++;
          break;
        }
      }
      continue;
    }
    const word = source.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0];
    if (word) {
      tokens.push({ kind: "word", value: word });
      index += word.length;
      continue;
    }
    tokens.push({ kind: "punctuation", value: character });
    index++;
  }

  const specifiers: string[] = [];
  const record = (token: (typeof tokens)[number] | undefined): void => {
    if (token?.kind === "string" && /^@(?:tiptap|floating-ui)\//.test(token.value))
      specifiers.push(token.value);
  };
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index]?.value === "import") {
      if (tokens[index + 1]?.kind === "string") record(tokens[index + 1]);
      else if (tokens[index + 1]?.value === "(") record(tokens[index + 2]);
      else {
        const from = tokens.slice(index + 1).findIndex((token) => token.value === "from");
        if (from >= 0) record(tokens[index + from + 2]);
      }
    }
    if (tokens[index]?.value === "export") {
      const from = tokens.slice(index + 1).findIndex((token) => token.value === "from");
      if (from >= 0) record(tokens[index + from + 2]);
    }
  }
  return specifiers;
}

async function findFiles(root: string, name: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name === name) files.push(path);
    }
  };
  await visit(root);
  return files;
}

async function discoverWorkspacePackageDirectories(root: string): Promise<string[]> {
  const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  const lines = workspace.split("\n");
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (line === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) break;
    const pattern = line.match(/^\s+-\s+(.+)$/)?.[1];
    if (inPackages && pattern) patterns.push(pattern);
  }
  const manifests = (
    await Promise.all(
      patterns.map(async (pattern) => {
        const prefix = pattern.split("*")[0]!.replace(/\/$/, "");
        return findFiles(join(root, prefix), "package.json");
      }),
    )
  ).flat();
  return [...new Set(manifests.map(dirname))].sort();
}

async function runtimeModuleFiles(packageDirectory: string): Promise<string[]> {
  const sourceDirectory = join(packageDirectory, "src");
  try {
    const files = await findFiles(sourceDirectory, "__never_exact_module_name__");
    void files;
  } catch {
    return [];
  }
  const modules: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (
        /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      )
        modules.push(path);
    }
  };
  await visit(sourceDirectory);
  return modules;
}

async function workspaceOwnershipViolations(root: string): Promise<string[]> {
  const violations: string[] = [];
  for (const directory of await discoverWorkspacePackageDirectories(root)) {
    const manifestPath = join(directory, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    };
    if (manifest.name !== "@muscat/rich-text") {
      for (const dependency of Object.keys(dependencies))
        if (/^@(?:tiptap|floating-ui)\//.test(dependency))
          violations.push(`${manifestPath}: dependency ${dependency}`);
      for (const file of await runtimeModuleFiles(directory)) {
        for (const specifier of forbiddenModuleSpecifiers(await readFile(file, "utf8")))
          violations.push(`${file}: import ${specifier}`);
      }
    }
  }
  return violations;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("rich-text workspace ownership", () => {
  it.each([
    ['import Editor from "@tiptap/core";', "@tiptap/core"],
    ['import { Editor } from "@tiptap/core";', "@tiptap/core"],
    ['import "@tiptap/core";', "@tiptap/core"],
    ['export { Editor } from "@tiptap/core";', "@tiptap/core"],
    ['export * from "@tiptap/core";', "@tiptap/core"],
    ['const editor = await import("@tiptap/core");', "@tiptap/core"],
  ])("detects forbidden module syntax in %s", (source, specifier) => {
    expect(forbiddenModuleSpecifiers(source)).toEqual([specifier]);
  });

  it("ignores comments and ordinary strings", () => {
    expect(
      forbiddenModuleSpecifiers(`
        // import "@tiptap/core";
        const example = 'import("@floating-ui/dom")';
      `),
    ).toEqual([]);
  });

  it("discovers a newly added workspace package", async () => {
    const root = await mkdtemp(join(tmpdir(), "muscat-workspace-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "apps/new-package/src"), { recursive: true });
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await writeFile(
      join(root, "apps/new-package/package.json"),
      '{"name":"new-package","dependencies":{"@tiptap/core":"1.0.0"}}',
    );
    await writeFile(
      join(root, "apps/new-package/src/index.ts"),
      'void import("@floating-ui/dom");',
    );

    expect(await discoverWorkspacePackageDirectories(root)).toEqual([
      join(root, "apps/new-package"),
    ]);
    expect(await workspaceOwnershipViolations(root)).toEqual([
      `${join(root, "apps/new-package/package.json")}: dependency @tiptap/core`,
      `${join(root, "apps/new-package/src/index.ts")}: import @floating-ui/dom`,
    ]);
  });

  it("documents the public adapter and private Tiptap boundary", async () => {
    const readme = await readFile(join(workspaceRoot, "README.md"), "utf8");

    expect(readme).toContain("`@muscat/rich-text`");
    expect(readme).toContain("Tiptap is a private implementation detail");
    expect(readme).toContain("demo consumes only Muscat-owned APIs");
  });

  it("keeps editor-library dependencies and imports in the rich-text package", async () => {
    expect(await workspaceOwnershipViolations(workspaceRoot)).toEqual([]);
    expect(await readFile(join(workspaceRoot, "apps/demo/src/main.ts"), "utf8")).toContain(
      'from "@muscat/rich-text"',
    );
  });
});
