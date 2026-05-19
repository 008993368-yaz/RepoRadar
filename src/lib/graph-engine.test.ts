import { describe, expect, it } from "vitest";

import { buildRepositoryGraph, type GraphEngineFile } from "./graph-engine";

function file(overrides: Partial<GraphEngineFile> & Pick<GraphEngineFile, "path">): GraphEngineFile {
  return {
    content: "",
    language: "TypeScript",
    role: "source",
    ...overrides,
  };
}

describe("buildRepositoryGraph", () => {
  it("builds file and directory nodes with contains edges", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({ path: "src/app/page.tsx", role: "entrypoint" }),
        file({ path: "src/components/Button.tsx", role: "component" }),
      ],
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "dir:src", type: "directory" }),
        expect.objectContaining({ id: "dir:src/app", type: "directory" }),
        expect.objectContaining({ id: "file:src/app/page.tsx", type: "source_file" }),
        expect.objectContaining({ id: "file:src/components/Button.tsx", type: "component" }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "contains:dir:src->dir:src/app",
          source: "dir:src",
          target: "dir:src/app",
          label: "contains",
        }),
        expect.objectContaining({
          id: "contains:dir:src/app->file:src/app/page.tsx",
          source: "dir:src/app",
          target: "file:src/app/page.tsx",
          label: "contains",
        }),
      ]),
    );
  });

  it("resolves relative JavaScript and TypeScript imports to selected files", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({
          path: "src/app/page.tsx",
          content: `import { Button } from "../components/Button";`,
          role: "entrypoint",
        }),
        file({
          path: "src/components/Button.tsx",
          role: "component",
        }),
      ],
    });

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "imports:file:src/app/page.tsx->file:src/components/Button.tsx",
          source: "file:src/app/page.tsx",
          target: "file:src/components/Button.tsx",
          label: "imports",
        }),
      ]),
    );
  });

  it("resolves Python relative imports to selected files", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({
          path: "app/api/routes.py",
          language: "Python",
          content: `from .handlers import list_items`,
        }),
        file({
          path: "app/api/handlers.py",
          language: "Python",
        }),
      ],
    });

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "imports:file:app/api/routes.py->file:app/api/handlers.py",
          source: "file:app/api/routes.py",
          target: "file:app/api/handlers.py",
          label: "imports",
        }),
      ]),
    );
  });

  it("creates external dependency nodes for package imports", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({
          path: "src/app/page.tsx",
          content: `import React from "react";`,
        }),
        file({
          path: "app/main.py",
          language: "Python",
          content: `from fastapi import FastAPI`,
        }),
      ],
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "external:react", type: "external_dependency" }),
        expect.objectContaining({ id: "external:fastapi", type: "external_dependency" }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "file:src/app/page.tsx",
          target: "external:react",
          label: "depends_on",
        }),
        expect.objectContaining({
          source: "file:app/main.py",
          target: "external:fastapi",
          label: "depends_on",
        }),
      ]),
    );
  });

  it("detects Next.js, Express, and FastAPI route files and patterns", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({ path: "src/app/api/analyze/route.ts", role: "api" }),
        file({
          path: "server/routes.ts",
          content: `router.post("/repos", startAnalysis); app.get("/health", health);`,
        }),
        file({
          path: "app/main.py",
          language: "Python",
          content: `@app.get("/health")\ndef health():\n  return {}`,
        }),
      ],
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "file:src/app/api/analyze/route.ts", type: "api_route" }),
        expect.objectContaining({ id: "file:server/routes.ts", type: "api_route" }),
        expect.objectContaining({ id: "file:app/main.py", type: "api_route" }),
      ]),
    );
  });

  it("detects database/schema files and configuration relationships", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({ path: "drizzle.config.ts", role: "config" }),
        file({ path: "supabase/migrations/001_schema.sql", language: "SQL", role: "schema" }),
        file({ path: "prisma/schema.prisma", role: "schema" }),
        file({ path: "app/models.py", language: "Python", role: "schema" }),
      ],
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "file:drizzle.config.ts", type: "config_file" }),
        expect.objectContaining({
          id: "file:supabase/migrations/001_schema.sql",
          type: "schema_file",
        }),
        expect.objectContaining({ id: "file:prisma/schema.prisma", type: "schema_file" }),
        expect.objectContaining({ id: "file:app/models.py", type: "schema_file" }),
      ]),
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "file:supabase/migrations/001_schema.sql",
          target: "file:drizzle.config.ts",
          label: "configured_by",
        }),
      ]),
    );
  });

  it("keeps unresolved imports as node metadata without throwing", () => {
    const graph = buildRepositoryGraph({
      files: [
        file({
          path: "src/app/page.tsx",
          content: `import missing from "./missing";`,
        }),
        file({
          path: "src/empty.ts",
          content: "",
        }),
      ],
    });

    const sourceNode = graph.nodes.find((node) => node.id === "file:src/app/page.tsx");
    expect(sourceNode?.data.unresolvedImports).toEqual(["./missing"]);
    expect(graph.edges.some((edge) => edge.target.includes("missing"))).toBe(false);
  });

  it("builds at least 100 nodes and 300 edges for a large selected file set", () => {
    const files: GraphEngineFile[] = Array.from({ length: 100 }, (_, index) => {
      const imports = [1, 2, 3]
        .map((offset) => `import "../lib/file-${(index + offset) % 100}";`)
        .join("\n");

      return file({
        path: `src/lib/file-${index}.ts`,
        content: imports,
      });
    });

    const graph = buildRepositoryGraph({ files });

    expect(graph.nodes.length).toBeGreaterThanOrEqual(100);
    expect(graph.edges.filter((edge) => edge.label === "imports").length).toBeGreaterThanOrEqual(300);
  });
});
