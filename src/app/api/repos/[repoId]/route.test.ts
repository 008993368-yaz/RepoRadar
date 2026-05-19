import { beforeEach, describe, expect, it, vi } from "vitest";

const database = {};

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
};

const completedJob = {
  id: "job-uuid",
  repo_id: "repo-uuid",
  status: "completed",
  error_message: null,
  created_at: "2026-05-18T20:01:00.000Z",
  completed_at: "2026-05-18T20:02:00.000Z",
};

const output = {
  id: "output-uuid",
  repo_id: "repo-uuid",
  analysis_job_id: "job-uuid",
  repo_summary: "Repo summary",
  architecture_overview: "Architecture overview",
  learning_path: ["Read README.md"],
  suggested_tasks: [{ title: "Add docs", reason: "README exists.", paths: ["README.md"] }],
  metadata: {},
  created_at: "2026-05-18T20:02:01.000Z",
};

const files = [
  {
    id: "file-readme",
    repo_id: "repo-uuid",
    path: "README.md",
    language: "Markdown",
    size_bytes: 1000,
    content_hash: "hash",
    summary: "Project overview.",
    role: "readme",
    created_at: "2026-05-18T20:01:30.000Z",
  },
];

const {
  findLatestAnalysisJobMock,
  findLatestAnalysisOutputMock,
  findRepositoryByIdMock,
  getRepoDatabaseMock,
  listRepoFilesMock,
} = vi.hoisted(() => ({
  findLatestAnalysisJobMock: vi.fn(),
  findLatestAnalysisOutputMock: vi.fn(),
  findRepositoryByIdMock: vi.fn(),
  getRepoDatabaseMock: vi.fn(),
  listRepoFilesMock: vi.fn(),
}));

vi.mock("@/lib/repo-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repo-database")>();

  return {
    ...actual,
    findLatestAnalysisJob: findLatestAnalysisJobMock,
    findLatestAnalysisOutput: findLatestAnalysisOutputMock,
    findRepositoryById: findRepositoryByIdMock,
    getRepoDatabase: getRepoDatabaseMock,
    listRepoFiles: listRepoFilesMock,
  };
});

import { GET } from "./route";

describe("GET /api/repos/:repoId", () => {
  beforeEach(() => {
    getRepoDatabaseMock.mockReturnValue(database);
    findRepositoryByIdMock.mockResolvedValue(repo);
    findLatestAnalysisJobMock.mockResolvedValue(completedJob);
    findLatestAnalysisOutputMock.mockResolvedValue(output);
    listRepoFilesMock.mockResolvedValue(files);
  });

  it("returns stored dashboard data without rerunning analysis", async () => {
    const response = await GET(new Request("http://localhost/api/repos/repo-uuid"), {
      params: Promise.resolve({ repoId: "repo-uuid" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        repo: {
          id: "repo-uuid",
          owner: "vercel",
          name: "next.js",
        },
        summary: "Repo summary",
        architectureOverview: "Architecture overview",
        importantFiles: [{ path: "README.md", role: "readme" }],
        suggestedTasks: [{ title: "Add docs", paths: ["README.md"] }],
        job: { id: "job-uuid", status: "completed" },
      },
    });
    expect(findRepositoryByIdMock).toHaveBeenCalledWith(database, "repo-uuid");
  });

  it("returns not found when the repository row does not exist", async () => {
    findRepositoryByIdMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/repos/missing"), {
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

  it("returns failed analysis state when the latest job failed", async () => {
    findLatestAnalysisJobMock.mockResolvedValue({
      ...completedJob,
      status: "failed",
      error_message: "Analysis failed while building graph.",
    });

    const response = await GET(new Request("http://localhost/api/repos/repo-uuid"), {
      params: Promise.resolve({ repoId: "repo-uuid" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "analysis_failed",
        message: "Repository analysis failed.",
        details: {
          repoId: "repo-uuid",
          jobId: "job-uuid",
          status: "failed",
        },
      },
    });
  });
});
