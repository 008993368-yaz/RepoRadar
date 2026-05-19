import { beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubApiError, type GitHubFileTreeEntry, type GitHubRepository } from "./github-client";
import { analyzeRepository, AnalysisPipelineError } from "./analysis-service";
import type {
  AnalysisJobRow,
  FileRow,
  GraphNodeInsert,
  GraphNodeRow,
  Json,
  RepoDatabase,
  RepoRow,
} from "./repo-database";

const repository: GitHubRepository = {
  owner: "vercel",
  name: "next.js",
  url: "https://github.com/vercel/next.js",
  description: "The React Framework",
  stars: 123,
  forks: 45,
  defaultBranch: "canary",
  primaryLanguage: "TypeScript",
  license: "MIT",
};

const repoRow: RepoRow = {
  id: "repo-uuid",
  owner: "vercel",
  name: "next.js",
  url: "https://github.com/vercel/next.js",
  description: "The React Framework",
  default_branch: "canary",
  primary_language: "TypeScript",
  stars: 123,
  forks: 45,
  license: "MIT",
  readme: "# next.js",
  created_at: "2026-05-18T20:00:00.000Z",
  updated_at: "2026-05-18T20:00:00.000Z",
};

const completedJob: AnalysisJobRow = {
  id: "job-uuid",
  repo_id: "repo-uuid",
  status: "completed",
  error_message: null,
  created_at: "2026-05-18T20:00:00.000Z",
  completed_at: "2026-05-18T20:01:00.000Z",
};

const queuedJob: AnalysisJobRow = {
  id: "job-uuid",
  repo_id: "repo-uuid",
  status: "queued",
  error_message: null,
  created_at: "2026-05-18T20:00:00.000Z",
  completed_at: null,
};

function treeEntry(path: string, size = 100): GitHubFileTreeEntry {
  return {
    path,
    sha: `sha-${path}`,
    size,
    url: `https://api.github.test/blob/${path}`,
  };
}

function fileRow(partial: Partial<FileRow> & Pick<FileRow, "id" | "path">): FileRow {
  return {
    repo_id: "repo-uuid",
    language: null,
    size_bytes: 100,
    content_hash: null,
    summary: null,
    role: "source",
    created_at: "2026-05-18T20:00:00.000Z",
    ...partial,
  };
}

function graphNodeRow(insert: GraphNodeInsert, index: number): GraphNodeRow {
  return {
    id: `graph-node-${index}`,
    repo_id: insert.repo_id,
    file_id: insert.file_id ?? null,
    label: insert.label,
    path: insert.path,
    type: insert.type,
    summary: insert.summary ?? null,
    metadata: insert.metadata ?? {},
  };
}

describe("analysis service", () => {
  const database = { client: "supabase" } as unknown as RepoDatabase;
  const github = {
    fetchRepository: vi.fn(),
    fetchReadme: vi.fn(),
    fetchFileTree: vi.fn(),
    fetchRawFileContent: vi.fn(),
  };
  const summarizer = {
    generateAnalysis: vi.fn(),
  };
  const repoStore = {
    findRepositoryByOwnerName: vi.fn(),
    findLatestCompletedAnalysisJob: vi.fn(),
    listRepoFiles: vi.fn(),
    listGraphNodes: vi.fn(),
    upsertRepository: vi.fn(),
    createAnalysisJob: vi.fn(),
    updateAnalysisJob: vi.fn(),
    upsertFiles: vi.fn(),
    upsertGraphNodes: vi.fn(),
    deleteGraphEdges: vi.fn(),
    insertGraphEdges: vi.fn(),
    insertAnalysisOutput: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    github.fetchRepository.mockResolvedValue(repository);
    github.fetchReadme.mockResolvedValue("# next.js");
    github.fetchFileTree.mockResolvedValue([
      treeEntry("README.md", 300),
      treeEntry("src/app/page.tsx", 100),
      treeEntry("src/app/header.tsx", 80),
    ]);
    github.fetchRawFileContent.mockImplementation(
      async (_owner: string, _repo: string, path: string) => {
        if (path === "src/app/page.tsx") {
          return "import Header from './header';\nexport default function Page() {}";
        }

        if (path === "src/app/header.tsx") {
          return "export default function Header() {}";
        }

        return "# next.js";
      },
    );
    summarizer.generateAnalysis.mockResolvedValue({
      fileSummaries: new Map([
        ["README.md", "Readme summary"],
        ["src/app/page.tsx", "Page summary"],
        ["src/app/header.tsx", "Header summary"],
      ]),
      repoSummary: "Repo summary referencing README.md and src/app/page.tsx",
      architectureOverview: "Architecture overview referencing src/app/page.tsx",
      learningPath: ["Read README.md", "Read src/app/page.tsx"],
      suggestedTasks: [
        {
          title: "Add page tests",
          reason: "src/app/page.tsx is an entry point.",
          paths: ["src/app/page.tsx"],
        },
      ],
      metadata: { provider: "mock" },
    });
    repoStore.findRepositoryByOwnerName.mockResolvedValue(null);
    repoStore.findLatestCompletedAnalysisJob.mockResolvedValue(null);
    repoStore.listRepoFiles.mockResolvedValue([]);
    repoStore.listGraphNodes.mockResolvedValue([]);
    repoStore.upsertRepository.mockResolvedValue(repoRow);
    repoStore.createAnalysisJob.mockResolvedValue(queuedJob);
    repoStore.updateAnalysisJob.mockImplementation(async (_db, _jobId, update) => ({
      ...queuedJob,
      ...update,
    }));
    repoStore.upsertFiles.mockResolvedValue([
      fileRow({ id: "file-readme", path: "README.md", role: "readme" }),
      fileRow({ id: "file-page", path: "src/app/page.tsx", role: "entrypoint" }),
      fileRow({ id: "file-header", path: "src/app/header.tsx", role: "entrypoint" }),
    ]);
    repoStore.upsertGraphNodes.mockImplementation(async (_db, nodes) =>
      nodes.map((node: GraphNodeInsert, index: number) => graphNodeRow(node, index)),
    );
    repoStore.deleteGraphEdges.mockResolvedValue(undefined);
    repoStore.insertGraphEdges.mockResolvedValue([]);
    repoStore.insertAnalysisOutput.mockResolvedValue({
      id: "output-uuid",
      repo_id: "repo-uuid",
      analysis_job_id: "job-uuid",
      repo_summary: "Repo summary referencing README.md and src/app/page.tsx",
      architecture_overview: "Architecture overview referencing src/app/page.tsx",
      learning_path: ["Read README.md", "Read src/app/page.tsx"],
      suggested_tasks: [
        {
          title: "Add page tests",
          reason: "src/app/page.tsx is an entry point.",
          paths: ["src/app/page.tsx"],
        },
      ],
      metadata: { provider: "mock" },
      created_at: "2026-05-18T20:00:00.000Z",
    });
  });

  it("runs the staged analysis, persists content hashes, graph data, and completes the job", async () => {
    const result = await analyzeRepository("github.com/vercel/next.js", {
      database,
      github,
      summarizer,
      repoStore,
      now: () => new Date("2026-05-18T20:02:00.000Z"),
    });

    expect(result).toEqual({
      repoId: "repo-uuid",
      jobId: "job-uuid",
      status: "completed",
    });
    expect(repoStore.findRepositoryByOwnerName).toHaveBeenCalledWith(database, "vercel", "next.js");
    expect(github.fetchRepository).toHaveBeenCalledWith("vercel", "next.js");
    expect(github.fetchRawFileContent).toHaveBeenCalledWith("vercel", "next.js", "src/app/page.tsx", "canary");
    expect(repoStore.updateAnalysisJob).toHaveBeenNthCalledWith(1, database, "job-uuid", {
      status: "running",
      error_message: null,
    });
    expect(repoStore.upsertFiles).toHaveBeenCalledWith(
      database,
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/app/page.tsx",
          content_hash: "2f8f70f18998afca662ae3ff88bd872d93d4b4f68c1b8613fedb6672d2f17399",
          summary: "Page summary",
        }),
      ]),
    );
    expect(repoStore.upsertGraphNodes).toHaveBeenCalledWith(
      database,
      expect.arrayContaining([
        expect.objectContaining({
          repo_id: "repo-uuid",
          file_id: "file-page",
          path: "src/app/page.tsx",
          type: "source_file",
          summary: "Page summary",
          metadata: expect.objectContaining({
            reactFlowId: "file:src/app/page.tsx",
            role: "entrypoint",
            imports: ["./header"],
          }),
        }),
      ]),
    );
    expect(repoStore.deleteGraphEdges).toHaveBeenCalledWith(database, "repo-uuid");
    expect(repoStore.insertGraphEdges).toHaveBeenCalledWith(
      database,
      expect.arrayContaining([
        expect.objectContaining({
          repo_id: "repo-uuid",
          source_node_id: expect.any(String),
          target_node_id: expect.any(String),
          type: "imports",
          confidence: 0.95,
          metadata: expect.objectContaining({
            reactFlowId: "imports:file:src/app/page.tsx->file:src/app/header.tsx",
            sourceReactFlowId: "file:src/app/page.tsx",
            targetReactFlowId: "file:src/app/header.tsx",
            specifier: "./header",
          }),
        }),
      ]),
    );
    expect(repoStore.insertAnalysisOutput).toHaveBeenCalledWith(database, {
      repo_id: "repo-uuid",
      analysis_job_id: "job-uuid",
      repo_summary: "Repo summary referencing README.md and src/app/page.tsx",
      architecture_overview: "Architecture overview referencing src/app/page.tsx",
      learning_path: ["Read README.md", "Read src/app/page.tsx"],
      suggested_tasks: [
        {
          title: "Add page tests",
          reason: "src/app/page.tsx is an entry point.",
          paths: ["src/app/page.tsx"],
        },
      ] satisfies Json,
      metadata: { provider: "mock" },
    });
    expect(repoStore.updateAnalysisJob).toHaveBeenLastCalledWith(database, "job-uuid", {
      status: "completed",
      error_message: null,
      completed_at: "2026-05-18T20:02:00.000Z",
    });
  });

  it("returns a cached completed job without expensive GitHub or summarizer work", async () => {
    repoStore.findRepositoryByOwnerName.mockResolvedValue(repoRow);
    repoStore.findLatestCompletedAnalysisJob.mockResolvedValue(completedJob);
    repoStore.listRepoFiles.mockResolvedValue([fileRow({ id: "file-page", path: "src/app/page.tsx" })]);
    repoStore.listGraphNodes.mockResolvedValue([
      graphNodeRow(
        {
          repo_id: "repo-uuid",
          label: "page.tsx",
          path: "src/app/page.tsx",
          type: "source_file",
        },
        0,
      ),
    ]);

    await expect(
      analyzeRepository("github.com/vercel/next.js", {
        database,
        github,
        summarizer,
        repoStore,
      }),
    ).resolves.toEqual({
      repoId: "repo-uuid",
      jobId: "job-uuid",
      status: "completed",
    });
    expect(github.fetchRepository).not.toHaveBeenCalled();
    expect(github.fetchFileTree).not.toHaveBeenCalled();
    expect(github.fetchRawFileContent).not.toHaveBeenCalled();
    expect(summarizer.generateAnalysis).not.toHaveBeenCalled();
    expect(repoStore.createAnalysisJob).not.toHaveBeenCalled();
  });

  it("lets GitHub failures before job creation bubble without creating a failed job", async () => {
    github.fetchRepository.mockRejectedValue(
      new GitHubApiError("not_found", "Repository not found."),
    );

    await expect(
      analyzeRepository("github.com/vercel/next.js", {
        database,
        github,
        summarizer,
        repoStore,
      }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: "Repository not found.",
    });
    expect(repoStore.createAnalysisJob).not.toHaveBeenCalled();
    expect(repoStore.updateAnalysisJob).not.toHaveBeenCalled();
  });

  it("marks the analysis job failed when a later stage fails", async () => {
    github.fetchRawFileContent.mockRejectedValue(new Error("blob unavailable"));

    await expect(
      analyzeRepository("github.com/vercel/next.js", {
        database,
        github,
        summarizer,
        repoStore,
        now: () => new Date("2026-05-18T20:02:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "analysis_failed",
      message: "Analysis failed while fetching file contents.",
      repoId: "repo-uuid",
      jobId: "job-uuid",
    } satisfies Partial<AnalysisPipelineError>);
    expect(repoStore.updateAnalysisJob).toHaveBeenLastCalledWith(database, "job-uuid", {
      status: "failed",
      error_message: "Analysis failed while fetching file contents.",
      completed_at: "2026-05-18T20:02:00.000Z",
    });
  });

  it("stores fallback repo-level analysis output when intelligence generation reports fallback metadata", async () => {
    summarizer.generateAnalysis.mockResolvedValue({
      fileSummaries: new Map([
        ["README.md", "Fallback README summary"],
        ["src/app/page.tsx", "Fallback page summary"],
        ["src/app/header.tsx", "Fallback header summary"],
      ]),
      repoSummary: "Fallback repo summary referencing README.md",
      architectureOverview: "Fallback architecture referencing src/app/page.tsx",
      learningPath: ["Start with README.md"],
      suggestedTasks: [
        {
          title: "Improve README setup notes",
          reason: "README.md is selected.",
          paths: ["README.md"],
        },
      ],
      metadata: { provider: "fallback", fallbackReason: "model unavailable" },
    });

    await expect(
      analyzeRepository("github.com/vercel/next.js", {
        database,
        github,
        summarizer,
        repoStore,
      }),
    ).resolves.toEqual({
      repoId: "repo-uuid",
      jobId: "job-uuid",
      status: "completed",
    });

    expect(repoStore.insertAnalysisOutput).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        repo_summary: "Fallback repo summary referencing README.md",
        metadata: { provider: "fallback", fallbackReason: "model unavailable" },
      }),
    );
  });
});
