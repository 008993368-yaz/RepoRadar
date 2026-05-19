import { render, screen } from "@testing-library/react";
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
  repo_summary: "Next.js is a full-stack React framework for production applications.",
  architecture_overview: "The app router, compiler, and runtime packages work together.",
  learning_path: ["Start with README.md", "Then inspect packages/next/src/server"],
  suggested_tasks: [
    {
      title: "Document local setup",
      reason: "The README introduces setup but can better explain environment variables.",
      paths: ["README.md"],
    },
  ],
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
    content_hash: "hash-readme",
    summary: "Project overview and setup instructions.",
    role: "readme",
    created_at: "2026-05-18T20:01:30.000Z",
  },
  {
    id: "file-page",
    repo_id: "repo-uuid",
    path: "app/page.tsx",
    language: "TypeScript",
    size_bytes: 2400,
    content_hash: "hash-page",
    summary: "Main application entry point.",
    role: "component",
    created_at: "2026-05-18T20:01:31.000Z",
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

import RepoDashboardPage from "./page";

describe("RepoDashboardPage", () => {
  beforeEach(() => {
    getRepoDatabaseMock.mockReturnValue(database);
    findRepositoryByIdMock.mockResolvedValue(repo);
    findLatestAnalysisJobMock.mockResolvedValue(completedJob);
    findLatestAnalysisOutputMock.mockResolvedValue(output);
    listRepoFilesMock.mockResolvedValue(files);
  });

  it("renders completed analysis data in a dashboard", async () => {
    render(await RepoDashboardPage({ params: Promise.resolve({ repoId: "repo-uuid" }) }));

    expect(screen.getByRole("heading", { name: "vercel/next.js" })).toBeInTheDocument();
    expect(screen.getByText("The React Framework")).toBeInTheDocument();
    expect(screen.getByText("Next.js is a full-stack React framework for production applications.")).toBeInTheDocument();
    expect(screen.getByText("The app router, compiler, and runtime packages work together.")).toBeInTheDocument();
    expect(screen.getAllByText("TypeScript").length).toBeGreaterThan(0);
    expect(screen.getAllByText("README.md").length).toBeGreaterThan(0);
    expect(screen.getByText("Main application entry point.")).toBeInTheDocument();
    expect(screen.getByText("Document local setup")).toBeInTheDocument();
    expect(screen.getByText("Start with README.md")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Repository dependency map" })).toBeInTheDocument();
  });

  it("shows an in-progress state when analysis has not produced output yet", async () => {
    findLatestAnalysisJobMock.mockResolvedValue({ ...completedJob, status: "running" });
    findLatestAnalysisOutputMock.mockResolvedValue(null);
    listRepoFilesMock.mockResolvedValue([]);

    render(await RepoDashboardPage({ params: Promise.resolve({ repoId: "repo-uuid" }) }));

    expect(screen.getByRole("heading", { name: "vercel/next.js" })).toBeInTheDocument();
    expect(screen.getByText("Analysis is still running.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View analysis status" })).toHaveAttribute(
      "href",
      "/repos/repo-uuid/status",
    );
  });

  it("shows a failed analysis state with the stored error message", async () => {
    findLatestAnalysisJobMock.mockResolvedValue({
      ...completedJob,
      status: "failed",
      error_message: "Analysis failed while generating summaries.",
    });
    findLatestAnalysisOutputMock.mockResolvedValue(null);
    listRepoFilesMock.mockResolvedValue([]);

    render(await RepoDashboardPage({ params: Promise.resolve({ repoId: "repo-uuid" }) }));

    expect(screen.getByText("Analysis failed")).toBeInTheDocument();
    expect(screen.getByText("Analysis failed while generating summaries.")).toBeInTheDocument();
  });
});
