// @vitest-environment node

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isStringLiteral,
  SyntaxKind,
  type Node,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";
import { afterEach, describe, expect, it } from "vitest";

const workspaceRoot = join(import.meta.dirname, "../../..");
const temporaryRoots: string[] = [];

function forbiddenModuleSpecifiers(file: string): string[] {
  const api = new API();
  const snapshot = api.updateSnapshot({ openFiles: [file] });
  const sourceFile = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
  if (!sourceFile) {
    api.close();
    throw new Error(`TypeScript could not parse ${file}`);
  }
  const specifiers: string[] = [];
  const record = (node: Node | undefined): void => {
    if (node && isStringLiteral(node) && /^@(?:tiptap|floating-ui)\//.test(node.text))
      specifiers.push(node.text);
  };
  const visit = (node: Node): void => {
    if (isImportDeclaration(node) || isExportDeclaration(node)) record(node.moduleSpecifier);
    if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference))
      record(node.moduleReference.expression);
    if (isCallExpression(node) && node.expression.kind === SyntaxKind.ImportKeyword)
      record(node.arguments[0]);
    node.forEachChild(visit);
  };
  visit(sourceFile);
  snapshot.dispose();
  api.close();
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
  const modules: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage")
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (
        /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) &&
        !/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) &&
        !/(?:^|[.-])config\.(?:ts|js|mjs|cjs)$/.test(entry.name) &&
        !/\.d\.(?:ts|mts|cts)$/.test(entry.name)
      )
        modules.push(path);
    }
  };
  await visit(packageDirectory);
  return modules.sort();
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
        for (const specifier of forbiddenModuleSpecifiers(file))
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
    ['const template = `value: ${import("@tiptap/core")}`;', "@tiptap/core"],
    ['import Editor = require("@tiptap/core");', "@tiptap/core"],
  ])("detects forbidden module syntax in %s", async (source, specifier) => {
    const root = await mkdtemp(join(tmpdir(), "muscat-module-"));
    temporaryRoots.push(root);
    const file = join(root, "fixture.ts");
    await writeFile(file, source);
    expect(forbiddenModuleSpecifiers(file)).toEqual([specifier]);
  });

  it("ignores comments and ordinary strings", async () => {
    const root = await mkdtemp(join(tmpdir(), "muscat-module-"));
    temporaryRoots.push(root);
    const file = join(root, "fixture.ts");
    await writeFile(
      file,
      `
        // import "@tiptap/core";
        const example = 'import("@floating-ui/dom")';
      `,
    );
    expect(forbiddenModuleSpecifiers(file)).toEqual([]);
  });

  it("discovers a newly added workspace package", async () => {
    const root = await mkdtemp(join(tmpdir(), "muscat-workspace-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "apps/new-package/custom"), { recursive: true });
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    await writeFile(
      join(root, "apps/new-package/package.json"),
      '{"name":"new-package","dependencies":{"@tiptap/core":"1.0.0"}}',
    );
    await writeFile(join(root, "apps/new-package/index.ts"), 'void import("@floating-ui/dom");');
    await writeFile(
      join(root, "apps/new-package/custom/runtime.mjs"),
      'import "@tiptap/extension-link";',
    );

    expect(await discoverWorkspacePackageDirectories(root)).toEqual([
      join(root, "apps/new-package"),
    ]);
    expect(await workspaceOwnershipViolations(root)).toEqual([
      `${join(root, "apps/new-package/package.json")}: dependency @tiptap/core`,
      `${join(root, "apps/new-package/custom/runtime.mjs")}: import @tiptap/extension-link`,
      `${join(root, "apps/new-package/index.ts")}: import @floating-ui/dom`,
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
