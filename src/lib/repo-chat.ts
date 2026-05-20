import { createOpenAiProvider, type AiProvider } from "./ai-provider";
import { buildRepoChatPromptContext, createRepoChatPrompt } from "./ai-prompts";
import {
  findLatestAnalysisJob,
  findLatestAnalysisOutput,
  findRepositoryById,
  getRepoDatabase,
  insertChatMessage,
  listGraphNodes,
  listRepoFiles,
  type RepoDatabase,
} from "./repo-database";

export type RepoChatCitation = { path: string; reason: string };
export type RepoChatAnswer = { answer: string; citations: RepoChatCitation[] };

export type RepoChatServiceErrorCode =
  | "invalid_request"
  | "repo_not_found"
  | "analysis_failed"
  | "analysis_incomplete"
  | "invalid_ai_response";

export class RepoChatServiceError extends Error {
  constructor(
    public readonly code: RepoChatServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RepoChatServiceError";
  }
}

export async function answerRepoChatQuestion(input: {
  repoId: string;
  message: string;
  database?: RepoDatabase;
  aiProvider?: AiProvider;
}): Promise<RepoChatAnswer> {
  const message = input.message.trim();
  if (message === "") {
    throw new RepoChatServiceError("invalid_request", "Repo chat message must not be empty.");
  }

  const database = input.database ?? getRepoDatabase();
  const repo = await findRepositoryById(database, input.repoId);
  if (!repo) {
    throw new RepoChatServiceError("repo_not_found", "Repository was not found.");
  }

  const job = await findLatestAnalysisJob(database, input.repoId);
  if (!job) {
    throw new RepoChatServiceError("analysis_incomplete", "Repository analysis is not complete.");
  }
  if (job.status === "failed") {
    throw new RepoChatServiceError(
      "analysis_failed",
      job.error_message ?? "Repository analysis failed.",
    );
  }
  if (job.status !== "completed") {
    throw new RepoChatServiceError("analysis_incomplete", "Repository analysis is not complete.");
  }

  const [analysisOutput, files, graphNodes] = await Promise.all([
    findLatestAnalysisOutput(database, input.repoId),
    listRepoFiles(database, input.repoId),
    listGraphNodes(database, input.repoId),
  ]);
  if (!analysisOutput || analysisOutput.analysis_job_id !== job.id) {
    throw new RepoChatServiceError("analysis_incomplete", "Repository analysis output is missing.");
  }

  await insertChatMessage(database, {
    repo_id: input.repoId,
    role: "user",
    content: message,
    citations: [],
  });

  const aiProvider = input.aiProvider ?? createOpenAiProvider();
  const prompt = createRepoChatPrompt(
    buildRepoChatPromptContext({
      repo,
      analysisOutput,
      files,
      graphNodes,
      question: message,
    }),
  );
  const response = await aiProvider.generateJson<unknown>(prompt);
  const answer = parseRepoChatAnswer(response, allowedCitationPaths(files, graphNodes));

  await insertChatMessage(database, {
    repo_id: input.repoId,
    role: "assistant",
    content: answer.answer,
    citations: answer.citations,
  });

  return answer;
}

function parseRepoChatAnswer(
  response: unknown,
  validCitationPaths: ReadonlySet<string>,
): RepoChatAnswer {
  if (!isRecord(response) || typeof response.answer !== "string") {
    throw invalidAiResponse();
  }

  const answer = response.answer.trim();
  if (answer === "" || !Array.isArray(response.citations)) {
    throw invalidAiResponse();
  }

  const citations = response.citations.map((citation) => {
    if (
      !isRecord(citation) ||
      typeof citation.path !== "string" ||
      typeof citation.reason !== "string"
    ) {
      throw invalidAiResponse();
    }

    const path = citation.path.trim();
    const reason = citation.reason.trim();
    if (path === "" || reason === "") {
      throw invalidAiResponse();
    }
    if (!validCitationPaths.has(path)) {
      throw invalidAiResponse();
    }

    return { path, reason };
  });

  return { answer, citations };
}

function invalidAiResponse(): RepoChatServiceError {
  return new RepoChatServiceError(
    "invalid_ai_response",
    "AI repo chat response did not match the expected shape.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function allowedCitationPaths(
  files: Array<{ path: string }>,
  graphNodes: Array<{ path: string }>,
): ReadonlySet<string> {
  return new Set([...files.map((file) => file.path), ...graphNodes.map((node) => node.path)]);
}
