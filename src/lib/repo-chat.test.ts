import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiProvider } from "./ai-provider";
import type { RepoDatabase } from "./repo-database";
import { answerRepoChatQuestion, RepoChatServiceError } from "./repo-chat";

const database = {} as RepoDatabase;

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
  status: "completed" as const,
  error_message: null,
  created_at: "2026-05-18T20:01:00.000Z",
  completed_at: "2026-05-18T20:02:00.000Z",
};

const output = {
  id: "output-uuid",
  repo_id: "repo-uuid",
  analysis_job_id: "job-uuid",
  repo_summary: "Repo summary referencing README.md",
  architecture_overview: "Architecture overview referencing app/page.tsx",
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

const graphNodes = [
  {
    id: "node-page",
    repo_id: "repo-uuid",
    file_id: "file-page",
    label: "app/page.tsx",
    path: "app/page.tsx",
    type: "component",
    summary: "Main app entry.",
    metadata: {},
  },
];

const {
  findLatestAnalysisJobMock,
  findLatestAnalysisOutputMock,
  findRepositoryByIdMock,
  insertChatMessageMock,
  listGraphNodesMock,
  listRepoFilesMock,
} = vi.hoisted(() => ({
  findLatestAnalysisJobMock: vi.fn(),
  findLatestAnalysisOutputMock: vi.fn(),
  findRepositoryByIdMock: vi.fn(),
  insertChatMessageMock: vi.fn(),
  listGraphNodesMock: vi.fn(),
  listRepoFilesMock: vi.fn(),
}));

vi.mock("./repo-database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repo-database")>();

  return {
    ...actual,
    findLatestAnalysisJob: findLatestAnalysisJobMock,
    findLatestAnalysisOutput: findLatestAnalysisOutputMock,
    findRepositoryById: findRepositoryByIdMock,
    insertChatMessage: insertChatMessageMock,
    listGraphNodes: listGraphNodesMock,
    listRepoFiles: listRepoFilesMock,
  };
});

describe("repo chat service", () => {
  const aiProvider: AiProvider = {
    generateJson: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiProvider.generateJson).mockResolvedValue({
      answer: "Start with README.md, then inspect app/page.tsx.",
      citations: [{ path: "README.md", reason: "Project overview." }],
    });
    findRepositoryByIdMock.mockResolvedValue(repo);
    findLatestAnalysisJobMock.mockResolvedValue(completedJob);
    findLatestAnalysisOutputMock.mockResolvedValue(output);
    listRepoFilesMock.mockResolvedValue(files);
    listGraphNodesMock.mockResolvedValue(graphNodes);
    insertChatMessageMock.mockImplementation(async (_database, message) => ({
      id: `message-${message.role}`,
      created_at: "2026-05-18T20:03:00.000Z",
      ...message,
    }));
  });

  it("stores the user and assistant messages and returns a grounded cited answer", async () => {
    const result = await answerRepoChatQuestion({
      repoId: "repo-uuid",
      message: "What file should I read first?",
      database,
      aiProvider,
    });

    expect(result).toEqual({
      answer: "Start with README.md, then inspect app/page.tsx.",
      citations: [{ path: "README.md", reason: "Project overview." }],
    });
    expect(aiProvider.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Question: What file should I read first?"),
        schemaName: "repo_chat_answer",
      }),
    );
    expect(aiProvider.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("Repo summary referencing README.md"),
      }),
    );
    expect(insertChatMessageMock).toHaveBeenNthCalledWith(1, database, {
      repo_id: "repo-uuid",
      role: "user",
      content: "What file should I read first?",
      citations: [],
    });
    expect(insertChatMessageMock).toHaveBeenNthCalledWith(2, database, {
      repo_id: "repo-uuid",
      role: "assistant",
      content: "Start with README.md, then inspect app/page.tsx.",
      citations: [{ path: "README.md", reason: "Project overview." }],
    });
  });

  it("rejects empty messages", async () => {
    await expect(
      answerRepoChatQuestion({ repoId: "repo-uuid", message: "  ", database, aiProvider }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("rejects missing repositories", async () => {
    findRepositoryByIdMock.mockResolvedValue(null);

    await expect(
      answerRepoChatQuestion({ repoId: "missing", message: "Where do I start?", database, aiProvider }),
    ).rejects.toMatchObject({ code: "repo_not_found" });
  });

  it("rejects failed analysis jobs", async () => {
    findLatestAnalysisJobMock.mockResolvedValue({
      ...completedJob,
      status: "failed",
      error_message: "Analysis failed.",
    });

    await expect(
      answerRepoChatQuestion({ repoId: "repo-uuid", message: "Where do I start?", database, aiProvider }),
    ).rejects.toMatchObject({ code: "analysis_failed" });
  });

  it("rejects incomplete analysis without stored output", async () => {
    findLatestAnalysisJobMock.mockResolvedValue({ ...completedJob, status: "running" });
    findLatestAnalysisOutputMock.mockResolvedValue(null);

    await expect(
      answerRepoChatQuestion({ repoId: "repo-uuid", message: "Where do I start?", database, aiProvider }),
    ).rejects.toMatchObject({ code: "analysis_incomplete" });
  });

  it("normalizes malformed AI responses", async () => {
    vi.mocked(aiProvider.generateJson).mockResolvedValue({ answer: "", citations: [] });

    await expect(
      answerRepoChatQuestion({ repoId: "repo-uuid", message: "Where do I start?", database, aiProvider }),
    ).rejects.toEqual(
      new RepoChatServiceError("invalid_ai_response", "AI repo chat response did not match the expected shape."),
    );
  });

  it("rejects citations that are not present in the loaded repo context", async () => {
    vi.mocked(aiProvider.generateJson).mockResolvedValue({
      answer: "Start with a file that is not in context.",
      citations: [{ path: "src/missing.ts", reason: "The model guessed this path." }],
    });

    await expect(
      answerRepoChatQuestion({ repoId: "repo-uuid", message: "Where do I start?", database, aiProvider }),
    ).rejects.toMatchObject({ code: "invalid_ai_response" });
    expect(insertChatMessageMock).toHaveBeenCalledTimes(1);
  });

  it("rejects stale analysis output from a different latest job", async () => {
    findLatestAnalysisOutputMock.mockResolvedValue({
      ...output,
      analysis_job_id: "older-job-uuid",
    });

    await expect(
      answerRepoChatQuestion({ repoId: "repo-uuid", message: "Where do I start?", database, aiProvider }),
    ).rejects.toMatchObject({ code: "analysis_incomplete" });
    expect(aiProvider.generateJson).not.toHaveBeenCalled();
    expect(insertChatMessageMock).not.toHaveBeenCalled();
  });
});
