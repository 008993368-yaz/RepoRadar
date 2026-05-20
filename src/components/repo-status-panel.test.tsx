import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepoStatusPanel } from "./repo-status-panel";

const runningStatus = {
  ok: true,
  data: {
    repoId: "repo-uuid",
    repo: {
      id: "repo-uuid",
      owner: "vercel",
      name: "next.js",
      url: "https://github.com/vercel/next.js",
      description: "The React Framework",
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
};

const completedStatus = {
  ok: true,
  data: {
    ...runningStatus.data,
    job: {
      ...runningStatus.data.job,
      status: "completed",
      completedAt: "2026-05-18T20:02:00.000Z",
    },
    isComplete: true,
    hasOutput: true,
  },
};

const failedStatus = {
  ok: true,
  data: {
    ...runningStatus.data,
    job: {
      ...runningStatus.data.job,
      status: "failed",
      errorMessage: "Analysis failed while generating summaries.",
      completedAt: "2026-05-18T20:02:00.000Z",
    },
    isComplete: false,
    hasOutput: false,
  },
};

const completedDashboardResponse = {
  ok: true,
  data: {
    repo: {
      id: "repo-uuid",
      owner: "vercel",
      name: "next.js",
      url: "https://github.com/vercel/next.js",
      description: "The React Framework",
      defaultBranch: "canary",
      primaryLanguage: "JavaScript",
      stars: 139539,
      forks: 31103,
      license: "MIT",
    },
    summary: "Repo summary",
    architectureOverview: "Architecture overview",
    learningPath: [],
    techStack: ["JavaScript"],
    importantFiles: [],
    suggestedTasks: [],
    job: {
      id: "job-uuid",
      status: "completed",
      errorMessage: null,
      createdAt: "2026-05-18T20:01:00.000Z",
      completedAt: "2026-05-18T20:02:00.000Z",
    },
  },
};

describe("RepoStatusPanel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a loading state before the first status request resolves", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));

    render(<RepoStatusPanel repoId="repo-uuid" />);

    expect(screen.getByRole("heading", { name: "Repository repo-uuid" })).toBeInTheDocument();
    expect(screen.getByText("Loading analysis status...")).toBeInTheDocument();
  });

  it("renders the running checklist and keeps polling active jobs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(runningStatus))
        .mockResolvedValueOnce(jsonResponse(completedStatus)),
    );

    render(<RepoStatusPanel repoId="repo-uuid" />);

    await flushPromises();

    expect(screen.getByRole("heading", { name: "vercel/next.js" })).toBeInTheDocument();
    expect(screen.getByText("RepoRadar is analyzing this repository now.")).toBeInTheDocument();
    expect(screen.getByText("Fetching metadata")).toBeInTheDocument();
    expect(screen.getByText("Reading file tree")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: "View dashboard" })).toHaveAttribute(
      "href",
      "/repos/repo-uuid",
    );
  });

  it("shows a dashboard link when analysis is completed with output", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(completedStatus)));

    render(<RepoStatusPanel repoId="repo-uuid" />);

    expect(await screen.findByText("Analysis complete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View dashboard" })).toHaveAttribute(
      "href",
      "/repos/repo-uuid",
    );
  });

  it("shows a readable failed state with a retry path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(failedStatus)));

    render(<RepoStatusPanel repoId="repo-uuid" />);

    expect(await screen.findByText("Analysis failed")).toBeInTheDocument();
    expect(screen.getByText("Analysis failed while generating summaries.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analyze another repository" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows API errors and stops polling", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            error: {
              code: "repo_not_found",
              message: "Repository analysis was not found.",
              details: { repoId: "missing" },
            },
          },
          false,
        ),
      ),
    );

    render(<RepoStatusPanel repoId="missing" />);

    await flushPromises();

    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
    expect(screen.getByText("Repository analysis was not found.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to the dashboard API when the nested status API returns HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
          text: async () => "<!DOCTYPE html><html><body>Not found</body></html>",
        })
        .mockResolvedValueOnce(jsonResponse(completedDashboardResponse)),
    );

    render(<RepoStatusPanel repoId="repo-uuid" />);

    expect(await screen.findByRole("heading", { name: "vercel/next.js" })).toBeInTheDocument();
    expect(screen.getByText("Analysis complete.")).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected token/)).not.toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(1, "/api/repos/repo-uuid/status");
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/repos/repo-uuid");
  });
});

function jsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
