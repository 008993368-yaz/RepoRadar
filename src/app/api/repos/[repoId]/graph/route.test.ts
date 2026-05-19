import { beforeEach, describe, expect, it, vi } from "vitest";

const database = {};
const repo = {
  id: "repo-uuid",
  owner: "vercel",
  name: "next.js",
  url: "https://github.com/vercel/next.js",
  description: null,
  default_branch: "main",
  primary_language: "TypeScript",
  stars: 1,
  forks: 2,
  license: "MIT",
  readme: null,
  created_at: "2026-05-18T20:00:00.000Z",
  updated_at: "2026-05-18T20:00:00.000Z",
};
const completedJob = {
  id: "job-uuid",
  repo_id: "repo-uuid",
  status: "completed",
  error_message: null,
  created_at: "2026-05-18T20:01:00.000Z",
  completed_at: "2026-05-18T20:02:00.000Z",
};
const graphNodes = [
  {
    id: "source-node",
    repo_id: "repo-uuid",
    file_id: "file-page",
    label: "page.tsx",
    path: "src/app/page.tsx",
    type: "component",
    summary: "Landing page.",
    metadata: { reactFlowId: "file:src/app/page.tsx", position: { x: 0, y: 0 } },
  },
  {
    id: "target-node",
    repo_id: "repo-uuid",
    file_id: "file-layout",
    label: "layout.tsx",
    path: "src/app/layout.tsx",
    type: "source_file",
    summary: "Layout.",
    metadata: { reactFlowId: "file:src/app/layout.tsx", position: { x: 220, y: 0 } },
  },
];
const graphEdges = [
  {
    id: "edge-uuid",
    repo_id: "repo-uuid",
    source_node_id: "source-node",
    target_node_id: "target-node",
    type: "imports",
    confidence: 0.95,
    metadata: { reactFlowId: "imports:file:src/app/page.tsx->file:src/app/layout.tsx" },
  },
];

const {
  findLatestAnalysisJobMock,
  findRepositoryByIdMock,
  getRepoDatabaseMock,
  listGraphEdgesMock,
  listGraphNodesMock,
} = vi.hoisted(() => ({
  findLatestAnalysisJobMock: vi.fn(),
  findRepositoryByIdMock: vi.fn(),
  getRepoDatabaseMock: vi.fn(),
  listGraphEdgesMock: vi.fn(),
  listGraphNodesMock: vi.fn(),
}));

vi.mock("@/lib/repo-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repo-database")>();

  return {
    ...actual,
    findLatestAnalysisJob: findLatestAnalysisJobMock,
    findRepositoryById: findRepositoryByIdMock,
    getRepoDatabase: getRepoDatabaseMock,
    listGraphEdges: listGraphEdgesMock,
    listGraphNodes: listGraphNodesMock,
  };
});

import { GET } from "./route";

describe("GET /api/repos/:repoId/graph", () => {
  beforeEach(() => {
    getRepoDatabaseMock.mockReturnValue(database);
    findRepositoryByIdMock.mockResolvedValue(repo);
    findLatestAnalysisJobMock.mockResolvedValue(completedJob);
    listGraphNodesMock.mockResolvedValue(graphNodes);
    listGraphEdgesMock.mockResolvedValue(graphEdges);
  });

  it("returns React Flow-compatible graph data from stored rows", async () => {
    const response = await GET(new Request("http://localhost/api/repos/repo-uuid/graph"), {
      params: Promise.resolve({ repoId: "repo-uuid" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        nodes: [
          { id: "file:src/app/page.tsx", type: "component" },
          { id: "file:src/app/layout.tsx", type: "source_file" },
        ],
        edges: [
          {
            id: "imports:file:src/app/page.tsx->file:src/app/layout.tsx",
            source: "file:src/app/page.tsx",
            target: "file:src/app/layout.tsx",
            label: "imports",
          },
        ],
      },
    });
  });

  it("returns incomplete analysis when graph rows are not ready", async () => {
    listGraphNodesMock.mockResolvedValue([]);
    listGraphEdgesMock.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/repos/repo-uuid/graph"), {
      params: Promise.resolve({ repoId: "repo-uuid" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "analysis_incomplete",
        message: "Repository analysis is not ready yet.",
        details: {
          repoId: "repo-uuid",
          jobId: "job-uuid",
          status: "completed",
        },
      },
    });
  });
});
