import { beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubApiError } from "@/lib/github-client";
import { AppDatabaseError } from "@/lib/repo-database";

const { analyzeRepositoryMock } = vi.hoisted(() => ({
  analyzeRepositoryMock: vi.fn(),
}));

vi.mock("@/lib/analysis-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analysis-service")>();

  return {
    ...actual,
    analyzeRepository: analyzeRepositoryMock,
  };
});

import { AnalysisPipelineError } from "@/lib/analysis-service";
import { POST } from "./route";

describe("POST /api/analyze", () => {
  beforeEach(() => {
    analyzeRepositoryMock.mockReset();
    analyzeRepositoryMock.mockResolvedValue({
      repoId: "repo-uuid",
      jobId: "job-uuid",
      status: "completed",
    });
  });

  it("delegates valid GitHub repo submissions to the analysis service", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "github.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        repoId: "repo-uuid",
        jobId: "job-uuid",
        status: "completed",
      },
    });
    expect(response.status).toBe(200);
    expect(analyzeRepositoryMock).toHaveBeenCalledWith("github.com/vercel/next.js");
  });

  it("returns a typed validation error for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: "{",
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_repo_url",
        message: "Enter a GitHub repository like vercel/next.js.",
      },
    });
    expect(response.status).toBe(400);
    expect(analyzeRepositoryMock).not.toHaveBeenCalled();
  });

  it("returns a typed validation error for invalid repo input", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://gitlab.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_repo_url",
        message: "Enter a GitHub repository like vercel/next.js.",
      },
    });
    expect(response.status).toBe(400);
    expect(analyzeRepositoryMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid_repo", 400],
    ["not_found", 404],
    ["private_repo", 403],
    ["rate_limited", 429],
    ["network_error", 502],
    ["github_api_error", 502],
  ] as const)("returns a typed %s error from GitHub", async (code, status) => {
    analyzeRepositoryMock.mockRejectedValue(
      new GitHubApiError(code, "GitHub request failed."),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "github.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code,
        message: "GitHub request failed.",
      },
    });
    expect(response.status).toBe(status);
  });

  it("returns a typed error when database persistence fails", async () => {
    analyzeRepositoryMock.mockRejectedValue(
      new AppDatabaseError("database_error", "Unable to persist repository analysis data."),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "github.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "database_error",
        message: "Unable to persist repository analysis data.",
      },
    });
    expect(response.status).toBe(500);
  });

  it("includes repo and job details for failed analysis jobs", async () => {
    analyzeRepositoryMock.mockRejectedValue(
      new AnalysisPipelineError(
        "Analysis failed while fetching file contents.",
        "repo-uuid",
        "job-uuid",
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "github.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "analysis_failed",
        message: "Analysis failed while fetching file contents.",
        details: {
          repoId: "repo-uuid",
          jobId: "job-uuid",
        },
      },
    });
    expect(response.status).toBe(500);
  });
});
