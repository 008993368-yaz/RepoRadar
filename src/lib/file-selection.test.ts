import { describe, expect, it } from "vitest";

import {
  classifyFileRole,
  createContentHash,
  detectLanguage,
  selectImportantFiles,
  type FileRole,
} from "./file-selection";
import type { GitHubFileTreeEntry } from "./github-client";

function treeEntry(path: string, size: number | null = 100): GitHubFileTreeEntry {
  return {
    path,
    sha: `sha-${path}`,
    size,
    url: `https://api.github.test/blob/${path}`,
  };
}

describe("file selection", () => {
  it("ignores dependency, build, binary, generated, and oversized files", () => {
    const selected = selectImportantFiles(
      [
        treeEntry("README.md", 1200),
        treeEntry("node_modules/react/index.js", 500),
        treeEntry(".git/config", 100),
        treeEntry(".next/server/app.js", 500),
        treeEntry("dist/bundle.js", 500),
        treeEntry("coverage/lcov.info", 500),
        treeEntry("public/logo.png", 500),
        treeEntry("public/site.woff2", 500),
        treeEntry("src/generated/client.min.js", 500),
        treeEntry("src/generated/client.js.map", 500),
        treeEntry("src/large.ts", 100_001),
        treeEntry("src/app/page.tsx", 1200),
      ],
      { maxFileSizeBytes: 100_000 },
    );

    expect(selected.map((file) => file.path)).toEqual(["README.md", "src/app/page.tsx"]);
  });

  it("prioritizes important files deterministically", () => {
    const selected = selectImportantFiles([
      treeEntry("docs/usage.md"),
      treeEntry("src/lib/math.ts"),
      treeEntry("src/components/Button.tsx"),
      treeEntry("src/app/api/analyze/route.ts"),
      treeEntry("supabase/migrations/001_schema.sql"),
      treeEntry("src/app/page.tsx"),
      treeEntry("src/lib/math.test.ts"),
      treeEntry("package.json"),
      treeEntry("README.md"),
    ]);

    expect(selected.map((file) => file.path)).toEqual([
      "README.md",
      "package.json",
      "src/app/page.tsx",
      "src/app/api/analyze/route.ts",
      "supabase/migrations/001_schema.sql",
      "src/components/Button.tsx",
      "src/lib/math.ts",
      "src/lib/math.test.ts",
      "docs/usage.md",
    ]);
    expect(selected.map((file) => file.score)).toEqual(
      [...selected].map((file) => file.score).sort((a, b) => b - a),
    );
  });

  it("enforces the max file count after scoring", () => {
    const selected = selectImportantFiles(
      [
        treeEntry("src/lib/z.ts"),
        treeEntry("src/lib/a.ts"),
        treeEntry("README.md"),
        treeEntry("package.json"),
      ],
      { maxFiles: 2 },
    );

    expect(selected.map((file) => file.path)).toEqual(["README.md", "package.json"]);
  });

  it("allows unknown sizes only for recognized text files", () => {
    const selected = selectImportantFiles([
      treeEntry("src/app/page.tsx", null),
      treeEntry("assets/unknown.blob", null),
    ]);

    expect(selected.map((file) => file.path)).toEqual(["src/app/page.tsx"]);
  });

  it.each([
    ["README.md", "Markdown"],
    ["package.json", "JSON"],
    ["src/app/page.tsx", "TypeScript React"],
    ["src/lib/index.ts", "TypeScript"],
    ["src/components/Button.jsx", "JavaScript React"],
    ["scripts/build.js", "JavaScript"],
    ["styles/globals.css", "CSS"],
    ["supabase/migrations/001_schema.sql", "SQL"],
    ["src/app.py", "Python"],
    ["Dockerfile", "Dockerfile"],
    ["unknown.bin", null],
  ])("detects %s as %s", (path, language) => {
    expect(detectLanguage(path)).toBe(language);
  });

  it.each([
    ["README.md", "readme"],
    ["src/components/Button.tsx", "component"],
    ["src/app/api/analyze/route.ts", "api"],
    ["next.config.ts", "config"],
    ["supabase/migrations/001_schema.sql", "schema"],
    ["src/lib/file-selection.test.ts", "test"],
    ["src/app/page.tsx", "entrypoint"],
    ["src/lib/github-client.ts", "source"],
  ] satisfies Array<[string, FileRole]>)("classifies %s as %s", (path, role) => {
    expect(classifyFileRole(path)).toBe(role);
  });

  it("generates stable SHA-256 content hashes", () => {
    expect(createContentHash("same content")).toBe(createContentHash("same content"));
    expect(createContentHash("same content")).not.toBe(createContentHash("different content"));
    expect(createContentHash("same content")).toMatch(/^[a-f0-9]{64}$/);
  });
});
