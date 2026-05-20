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
const runningJob = {
  id: "job-uuid",
  repo_id: "repo-uuid",
  status: "running",
  error_message: null,
  created_at: "2026-05-18T20:01:00.000Z",
  completed_at: null,
};

const {
  findLatestAnalysisJobMock,
  findLatestAnalysisOutputMock,
  findRepositoryByIdMock,
  getRepoDatabaseMock,
} = vi.hoisted(() => ({
  findLatestAnalysisJobMock: vi.fn(),
  findLatestAnalysisOutputMock: vi.fn(),
  findRepositoryByIdMock: vi.fn(),
  getRepoDatabaseMock: vi.fn(),
}));

vi.mock("@/lib/repo-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repo-database")>();

  return {
    ...actual,
    findLatestAnalysisJob: findLatestAnalysisJobMock,
    findLatestAnalysisOutput: findLatestAnalysisOutputMock,
    findRepositoryById: findRepositoryByIdMock,
    getRepoDatabase: getRepoDatabaseMock,
  };
});

import { GET } from "./route";

describe("GET /api/repos/:repoId/status", () => {
  beforeEach(() => {
    getRepoDatabaseMock.mockReturnValue(database);
    findRepositoryByIdMock.mockResolvedValue(repo);
    findLatestAnalysisJobMock.mockResolvedValue(runningJob);
    findLatestAnalysisOutputMock.mockResolvedValue(null);
  });

  it("returns latest analysis status for polling", async () => {
    const response = await GET(new Request("http://localhost/api/repos/repo-uuid/status"), {
      params: Promise.resolve({ repoId: "repo-uuid" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        repoId: "repo-uuid",
        repo: {
          id: "repo-uuid",
          owner: "vercel",
          name: "next.js",
          url: "https://github.com/vercel/next.js",
          description: null,
        },
        job: {
          id: "job-uuid",
          status: "running",
          errorMessage: null,
          createdAt: "2026-05-18T20:01:00.000Z",
          completedAt: null,
        },
        isComplete: false,
        hasOutput: false,
      },
    });
  });

  it("returns not found for unknown repositories", async () => {
    findRepositoryByIdMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/repos/missing/status"), {
      params: Promise.resolve({ repoId: "missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "repo_not_found",
        message: "Repository analysis was not found.",
        details: { repoId: "missing" },
      },
    });
  });
});
