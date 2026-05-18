import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppDatabaseError } from "@/lib/repo-database";

const { createAnalysisJobMock, getRepoDatabaseMock, upsertRepositoryMock } = vi.hoisted(() => ({
  createAnalysisJobMock: vi.fn(),
  getRepoDatabaseMock: vi.fn(),
  upsertRepositoryMock: vi.fn(),
}));

vi.mock("@/lib/repo-database", () => ({
  AppDatabaseError: class AppDatabaseError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  createAnalysisJob: createAnalysisJobMock,
  getRepoDatabase: getRepoDatabaseMock,
  upsertRepository: upsertRepositoryMock,
}));

import { POST } from "./route";

describe("POST /api/analyze", () => {
  beforeEach(() => {
    createAnalysisJobMock.mockReset();
    getRepoDatabaseMock.mockReset();
    upsertRepositoryMock.mockReset();
    getRepoDatabaseMock.mockReturnValue({ client: "supabase" });
    upsertRepositoryMock.mockResolvedValue({ id: "repo-uuid" });
    createAnalysisJobMock.mockResolvedValue({ id: "job-uuid", status: "queued" });
  });

  it("creates or reuses a repository and creates a queued analysis job", async () => {
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
        status: "queued",
      },
    });
    expect(response.status).toBe(200);
    expect(upsertRepositoryMock).toHaveBeenCalledWith(
      { client: "supabase" },
      {
        owner: "vercel",
        name: "next.js",
        url: "https://github.com/vercel/next.js",
      },
    );
    expect(createAnalysisJobMock).toHaveBeenCalledWith({ client: "supabase" }, "repo-uuid");
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
    expect(getRepoDatabaseMock).not.toHaveBeenCalled();
    expect(upsertRepositoryMock).not.toHaveBeenCalled();
    expect(createAnalysisJobMock).not.toHaveBeenCalled();
  });

  it("returns a typed error when database persistence fails", async () => {
    upsertRepositoryMock.mockRejectedValue(
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
});
