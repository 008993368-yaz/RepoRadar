import { parseImports } from "./import-parser";
import type { AnalysisOutputRow, FileRow, GraphNodeRow, RepoRow } from "./repo-database";
import type { AnalysisSummarizerFile } from "./analysis-summarizer";
import type { GitHubRepository } from "./github-client";
import type { JsonSchema } from "./ai-provider";

export type PromptRequest = {
  instructions: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
};

export type RepoChatCitation = {
  path: string;
  reason: string;
};

export type SuggestedTask = {
  title: string;
  reason: string;
  paths: string[];
};

export const MAX_REPO_CONTEXT_FILES = 30;
export const MAX_FILE_EXCERPT_CHARS = 2_000;
export const MAX_README_EXCERPT_CHARS = 4_000;

export const fileSummarySchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
  additionalProperties: false,
};

export const repositoryAnalysisSchema = {
  type: "object",
  properties: {
    repoSummary: { type: "string" },
    architectureOverview: { type: "string" },
    learningPath: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 6,
    },
    suggestedTasks: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          reason: { type: "string" },
          paths: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["title", "reason", "paths"],
        additionalProperties: false,
      },
    },
  },
  required: ["repoSummary", "architectureOverview", "learningPath", "suggestedTasks"],
  additionalProperties: false,
} as const;

export const suggestedTasksSchema = {
  type: "object",
  properties: {
    tasks: repositoryAnalysisSchema.properties.suggestedTasks,
  },
  required: ["tasks"],
  additionalProperties: false,
} as const;

export const repoChatAnswerSchema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          reason: { type: "string" },
        },
        required: ["path", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["answer", "citations"],
  additionalProperties: false,
} as const;

export function createFileSummaryPrompt(input: {
  repository: GitHubRepository;
  readme: string | null;
  file: AnalysisSummarizerFile;
  relatedFiles: string[];
}): PromptRequest {
  return {
    instructions:
      "Use only the provided repository context. Summarize the file with purpose, key exports/functions when detectable, dependencies, related files, and why it matters. Mention real file paths as citations where useful.",
    input: [
      repositoryHeader(input.repository),
      `README excerpt:\n${truncateText(input.readme ?? "", MAX_README_EXCERPT_CHARS) || "(none)"}`,
      `File path: ${input.file.path}`,
      `Role: ${input.file.role}`,
      `Language: ${input.file.language ?? "unknown"}`,
      `Imports: ${importSpecifiers(input.file).join(", ") || "(none)"}`,
      `Related files: ${input.relatedFiles.join(", ") || "(none)"}`,
      `Content excerpt:\n${truncateText(input.file.content, MAX_FILE_EXCERPT_CHARS)}`,
    ].join("\n\n"),
    schemaName: "file_summary",
    schema: fileSummarySchema,
  };
}

export function createRepositoryAnalysisPrompt(context: string): PromptRequest {
  return {
    instructions:
      "Use only the provided repository context. Generate a concise repo summary, architecture overview, suggested learning path, and 3 to 5 beginner contribution tasks. Every task must reference only real paths from the context.",
    input: context,
    schemaName: "repository_analysis",
    schema: repositoryAnalysisSchema,
  };
}

export function createBeginnerTasksPrompt(context: string): PromptRequest {
  return {
    instructions:
      "Use only the provided repository context. Suggest 3 to 5 beginner contribution tasks grounded in README content, TODO comments, missing tests, or selected file paths.",
    input: context,
    schemaName: "beginner_tasks",
    schema: suggestedTasksSchema,
  };
}

export function createRepoChatPrompt(context: string): PromptRequest {
  return {
    instructions:
      "Use only the provided repository context to answer the user's question. If the context is insufficient, say what is missing instead of guessing. Always cite only real file paths from the context, and include a short reason for each citation.",
    input: context,
    schemaName: "repo_chat_answer",
    schema: repoChatAnswerSchema,
  };
}

export function buildRepositoryPromptContext(input: {
  repository: GitHubRepository;
  readme: string | null;
  files: AnalysisSummarizerFile[];
  fileSummaries: Map<string, string>;
}): string {
  const selectedFiles = input.files.slice(0, MAX_REPO_CONTEXT_FILES);

  return [
    repositoryHeader(input.repository),
    `README excerpt:\n${truncateText(input.readme ?? "", MAX_README_EXCERPT_CHARS) || "(none)"}`,
    "Selected files:",
    ...selectedFiles.map((file) => fileContextBlock(file, input.fileSummaries.get(file.path))),
  ].join("\n\n");
}

export function buildRepoChatPromptContext(input: {
  repo: RepoRow;
  analysisOutput: Pick<
    AnalysisOutputRow,
    "repo_summary" | "architecture_overview" | "learning_path" | "suggested_tasks"
  >;
  files: FileRow[];
  graphNodes: GraphNodeRow[];
  question: string;
}): string {
  const fileLines = input.files
    .slice(0, MAX_REPO_CONTEXT_FILES)
    .map((file) => `- ${file.path} (${file.role ?? "unknown"}): ${file.summary ?? "No summary stored."}`);
  const graphLines = input.graphNodes
    .slice(0, MAX_REPO_CONTEXT_FILES)
    .map((node) => `- ${node.path} (${node.type}): ${node.summary ?? "No summary stored."}`);

  return [
    `Repository: ${input.repo.owner}/${input.repo.name}`,
    `Description: ${input.repo.description ?? "none"}`,
    `Question: ${input.question}`,
    `Repo summary: ${input.analysisOutput.repo_summary}`,
    `Architecture overview: ${input.analysisOutput.architecture_overview}`,
    `Learning path: ${jsonList(input.analysisOutput.learning_path)}`,
    `Suggested tasks: ${jsonList(input.analysisOutput.suggested_tasks)}`,
    `File summaries:\n${fileLines.join("\n") || "(none)"}`,
    `Graph nodes:\n${graphLines.join("\n") || "(none)"}`,
    "Answer using only this context and cite file paths when relevant.",
  ].join("\n\n");
}

export function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}\n[truncated]`;
}

function repositoryHeader(repository: GitHubRepository): string {
  return [
    `Repository: ${repository.owner}/${repository.name}`,
    `URL: ${repository.url}`,
    `Description: ${repository.description ?? "none"}`,
    `Default branch: ${repository.defaultBranch}`,
    `Primary language: ${repository.primaryLanguage ?? "unknown"}`,
    `License: ${repository.license ?? "unknown"}`,
  ].join("\n");
}

function fileContextBlock(file: AnalysisSummarizerFile, summary: string | undefined): string {
  const todos = todoLines(file.content);

  return [
    `Path: ${file.path}`,
    `Role: ${file.role}`,
    `Language: ${file.language ?? "unknown"}`,
    `Summary: ${summary ?? "No summary generated yet."}`,
    `Imports: ${importSpecifiers(file).join(", ") || "(none)"}`,
    `TODOs: ${todos.join(" | ") || "(none)"}`,
    `Excerpt:\n${truncateText(file.content, MAX_FILE_EXCERPT_CHARS)}`,
  ].join("\n");
}

function importSpecifiers(file: AnalysisSummarizerFile): string[] {
  return parseImports(file)
    .map((parsedImport) => parsedImport.specifier)
    .filter(unique)
    .sort();
}

function todoLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\bTODO\b/i.test(line))
    .slice(0, 5);
}

function jsonList(value: unknown): string {
  return JSON.stringify(value);
}

function unique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
