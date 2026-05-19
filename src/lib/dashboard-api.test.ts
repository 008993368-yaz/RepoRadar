import { describe, expect, it } from "vitest";

import {
  createAnalysisFailedError,
  createAnalysisIncompleteError,
  mapDashboardData,
  mapGraphData,
  mapStatusData,
} from "./dashboard-api";
import type {
  AnalysisJobRow,
  AnalysisOutputRow,
  FileRow,
  GraphEdgeRow,
  GraphNodeRow,
  RepoRow,
} from "./repo-database";

const repo = {
  id: "repo-uuid",
  owner: "vercel",
  name: "next.js",
  url: "https://github.com/vercel/next.js",
  description: "The React Framework",
  default_branch: "main",
  primary_language: "TypeScript",
  stars: 130000,
  forks: 28000,
  license: "MIT",
  readme: "# Next.js",
  created_at: "2026-05-18T20:00:00.000Z",
  updated_at: "2026-05-18T20:00:00.000Z",
} satisfies RepoRow;

const completedJob = {
  id: "job-uuid",
  repo_id: "repo-uuid",
  status: "completed",
  error_message: null,
  created_at: "2026-05-18T20:01:00.000Z",
  completed_at: "2026-05-18T20:02:00.000Z",
} satisfies AnalysisJobRow;

const output = {
  id: "output-uuid",
  repo_id: "repo-uuid",
  analysis_job_id: "job-uuid",
  repo_summary: "Repo summary",
  architecture_overview: "Architecture overview",
  learning_path: ["Read README.md", "Read src/app/page.tsx"],
  suggested_tasks: [
    {
      title: "Improve README setup docs",
      reason: "The README is the onboarding entry point.",
      paths: ["README.md"],
    },
  ],
  metadata: { provider: "fallback" },
  created_at: "2026-05-18T20:02:01.000Z",
} satisfies AnalysisOutputRow;

const files = [
  {
    id: "file-readme",
    repo_id: "repo-uuid",
    path: "README.md",
    language: "Markdown",
    size_bytes: 1200,
    content_hash: "hash-readme",
    summary: "Project overview.",
    role: "readme",
    created_at: "2026-05-18T20:01:30.000Z",
  },
  {
    id: "file-page",
    repo_id: "repo-uuid",
    path: "src/app/page.tsx",
    language: "TypeScript",
    size_bytes: 2400,
    content_hash: "hash-page",
    summary: "Landing page.",
    role: "component",
    created_at: "2026-05-18T20:01:31.000Z",
  },
  {
    id: "file-config",
    repo_id: "repo-uuid",
    path: "next.config.ts",
    language: "TypeScript",
    size_bytes: 300,
    content_hash: "hash-config",
    summary: "Next.js config.",
    role: "config",
    created_at: "2026-05-18T20:01:32.000Z",
  },
] satisfies FileRow[];

describe("dashboard API mapping", () => {
  it("maps stored repo analysis into the dashboard response shape", () => {
    const data = mapDashboardData({ repo, job: completedJob, output, files });

    expect(data).toEqual({
      repo: {
        id: "repo-uuid",
        owner: "vercel",
        name: "next.js",
        url: "https://github.com/vercel/next.js",
        description: "The React Framework",
        defaultBranch: "main",
        primaryLanguage: "TypeScript",
        stars: 130000,
        forks: 28000,
        license: "MIT",
      },
      summary: "Repo summary",
      architectureOverview: "Architecture overview",
      learningPath: ["Read README.md", "Read src/app/page.tsx"],
      techStack: ["TypeScript", "Markdown", "Next.js"],
      importantFiles: [
        {
          id: "file-readme",
          path: "README.md",
          role: "readme",
          language: "Markdown",
          sizeBytes: 1200,
          summary: "Project overview.",
        },
        {
          id: "file-page",
          path: "src/app/page.tsx",
          role: "component",
          language: "TypeScript",
          sizeBytes: 2400,
          summary: "Landing page.",
        },
        {
          id: "file-config",
          path: "next.config.ts",
          role: "config",
          language: "TypeScript",
          sizeBytes: 300,
          summary: "Next.js config.",
        },
      ],
      suggestedTasks: [
        {
          title: "Improve README setup docs",
          reason: "The README is the onboarding entry point.",
          paths: ["README.md"],
        },
      ],
      job: {
        id: "job-uuid",
        status: "completed",
        errorMessage: null,
        createdAt: "2026-05-18T20:01:00.000Z",
        completedAt: "2026-05-18T20:02:00.000Z",
      },
    });
  });

  it("normalizes missing or malformed analysis JSON to empty arrays", () => {
    const data = mapDashboardData({
      repo,
      job: completedJob,
      output: {
        ...output,
        learning_path: { unexpected: true },
        suggested_tasks: [{ title: "Missing fields", paths: ["README.md"] }],
      },
      files: [],
    });

    expect(data.learningPath).toEqual([]);
    expect(data.suggestedTasks).toEqual([]);
  });

  it("maps status data with completion flags", () => {
    expect(mapStatusData({ repoId: "repo-uuid", job: completedJob, output })).toEqual({
      repoId: "repo-uuid",
      job: {
        id: "job-uuid",
        status: "completed",
        errorMessage: null,
        createdAt: "2026-05-18T20:01:00.000Z",
        completedAt: "2026-05-18T20:02:00.000Z",
      },
      isComplete: true,
      hasOutput: true,
    });
  });

  it("creates typed analysis state errors", () => {
    expect(createAnalysisFailedError(completedJob)).toEqual({
      code: "analysis_failed",
      message: "Repository analysis failed.",
      details: {
        jobId: "job-uuid",
        repoId: "repo-uuid",
        status: "completed",
      },
    });

    expect(createAnalysisIncompleteError("repo-uuid", completedJob)).toEqual({
      code: "analysis_incomplete",
      message: "Repository analysis is not ready yet.",
      details: {
        jobId: "job-uuid",
        repoId: "repo-uuid",
        status: "completed",
      },
    });
  });
});

describe("graph API mapping", () => {
  it("reconstructs React Flow nodes and edges from stored graph rows", () => {
    const nodes = [
      {
        id: "source-node",
        repo_id: "repo-uuid",
        file_id: "file-page",
        label: "page.tsx",
        path: "src/app/page.tsx",
        type: "component",
        summary: "Landing page.",
        metadata: {
          reactFlowId: "file:src/app/page.tsx",
          position: { x: 220, y: 140 },
          nodeType: "component",
          role: "component",
          language: "TypeScript",
          imports: ["./layout"],
        },
      },
      {
        id: "target-node",
        repo_id: "repo-uuid",
        file_id: "file-layout",
        label: "layout.tsx",
        path: "src/app/layout.tsx",
        type: "source_file",
        summary: "Root layout.",
        metadata: {
          reactFlowId: "file:src/app/layout.tsx",
          position: { x: 440, y: 140 },
          nodeType: "source_file",
          role: "source",
          language: "TypeScript",
        },
      },
    ] satisfies GraphNodeRow[];
    const edges = [
      {
        id: "edge-uuid",
        repo_id: "repo-uuid",
        source_node_id: "source-node",
        target_node_id: "target-node",
        type: "imports",
        confidence: 0.95,
        metadata: {
          reactFlowId: "imports:file:src/app/page.tsx->file:src/app/layout.tsx",
          specifier: "./layout",
        },
      },
    ] satisfies GraphEdgeRow[];

    expect(mapGraphData(nodes, edges)).toEqual({
      nodes: [
        {
          id: "file:src/app/page.tsx",
          type: "component",
          data: {
            label: "page.tsx",
            path: "src/app/page.tsx",
            summary: "Landing page.",
            nodeType: "component",
            fileId: "file-page",
            role: "component",
            language: "TypeScript",
            imports: ["./layout"],
          },
          position: { x: 220, y: 140 },
        },
        {
          id: "file:src/app/layout.tsx",
          type: "source_file",
          data: {
            label: "layout.tsx",
            path: "src/app/layout.tsx",
            summary: "Root layout.",
            nodeType: "source_file",
            fileId: "file-layout",
            role: "source",
            language: "TypeScript",
          },
          position: { x: 440, y: 140 },
        },
      ],
      edges: [
        {
          id: "imports:file:src/app/page.tsx->file:src/app/layout.tsx",
          source: "file:src/app/page.tsx",
          target: "file:src/app/layout.tsx",
          label: "imports",
          data: {
            edgeType: "imports",
            confidence: 0.95,
            specifier: "./layout",
          },
        },
      ],
    });
  });
});
