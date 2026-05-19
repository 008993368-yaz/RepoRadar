import path from "node:path";

import { createOpenAiProvider, type AiProvider } from "./ai-provider";
import {
  buildRepositoryPromptContext,
  createFileSummaryPrompt,
  createRepositoryAnalysisPrompt,
  type SuggestedTask,
} from "./ai-prompts";
import { parseImports } from "./import-parser";
import type { FileRole } from "./file-selection";
import type { GitHubRepository } from "./github-client";
import type { Json } from "./repo-database";

export type AnalysisSummarizerFile = {
  path: string;
  role: FileRole;
  language: string | null;
  content: string;
  summary?: string | null;
};

export type SummarizeFilesInput = {
  repository: GitHubRepository;
  readme: string | null;
  files: AnalysisSummarizerFile[];
};

export type AnalysisIntelligenceResult = {
  fileSummaries: Map<string, string>;
  repoSummary: string;
  architectureOverview: string;
  learningPath: string[];
  suggestedTasks: SuggestedTask[];
  metadata: Record<string, Json>;
};

export type AnalysisIntelligenceService = {
  generateAnalysis(input: SummarizeFilesInput): Promise<AnalysisIntelligenceResult>;
};

export type AnalysisSummarizer = AnalysisIntelligenceService;

type AnalysisIntelligenceOptions = {
  provider?: AiProvider;
};

type FileSummaryResponse = {
  summary: string;
};

type RepositoryAnalysisResponse = {
  repoSummary: string;
  architectureOverview: string;
  learningPath: string[];
  suggestedTasks: SuggestedTask[];
};

export function createAnalysisIntelligenceService(
  options: AnalysisIntelligenceOptions = {},
): AnalysisIntelligenceService {
  const provider = options.provider ?? createOpenAiProvider();
  const fallback = createFallbackAnalysisIntelligenceService();

  return {
    async generateAnalysis(input: SummarizeFilesInput): Promise<AnalysisIntelligenceResult> {
      try {
        const fileSummaries = new Map<string, string>();

        for (const file of input.files) {
          const relatedFiles = relatedFilePaths(file, input.files);
          const prompt = createFileSummaryPrompt({
            repository: input.repository,
            readme: input.readme,
            file,
            relatedFiles,
          });
          const response = await provider.generateJson<FileSummaryResponse>(prompt);
          assertFileSummaryResponse(response);
          fileSummaries.set(file.path, response.summary);
        }

        const repositoryContext = buildRepositoryPromptContext({
          ...input,
          fileSummaries,
        });
        const repositoryPrompt = createRepositoryAnalysisPrompt(repositoryContext);
        const repositoryResponse =
          await provider.generateJson<RepositoryAnalysisResponse>(repositoryPrompt);
        assertRepositoryAnalysisResponse(repositoryResponse);

        return {
          fileSummaries,
          repoSummary: repositoryResponse.repoSummary,
          architectureOverview: repositoryResponse.architectureOverview,
          learningPath: repositoryResponse.learningPath,
          suggestedTasks: sanitizeSuggestedTasks(repositoryResponse.suggestedTasks, input.files),
          metadata: { provider: "openai" } satisfies Record<string, Json>,
        };
      } catch (error) {
        const result = await fallback.generateAnalysis(input);
        return {
          ...result,
          metadata: {
            provider: "fallback",
            fallbackReason: errorMessage(error),
          },
        };
      }
    },
  };
}

export function createFallbackAnalysisIntelligenceService(): AnalysisIntelligenceService {
  return {
    async generateAnalysis(input: SummarizeFilesInput): Promise<AnalysisIntelligenceResult> {
      const fileSummaries = new Map(
        input.files.map((file) => [file.path, summarizeFile(input.repository, input.readme, file, input.files)]),
      );

      return {
        fileSummaries,
        repoSummary: fallbackRepoSummary(input.repository, input.files),
        architectureOverview: fallbackArchitectureOverview(input.files),
        learningPath: fallbackLearningPath(input.files),
        suggestedTasks: fallbackSuggestedTasks(input.files),
        metadata: { provider: "fallback" } satisfies Record<string, Json>,
      };
    },
  };
}

export function createFallbackAnalysisSummarizer(): AnalysisIntelligenceService {
  return createFallbackAnalysisIntelligenceService();
}

function summarizeFile(
  _repository: GitHubRepository,
  readme: string | null,
  file: AnalysisSummarizerFile,
  files: AnalysisSummarizerFile[],
): string {
  const role = humanizeRole(file.role);
  const language = file.language ? ` in ${file.language}` : "";
  const imports = importSpecifiers(file);
  const relatedFiles = relatedFilePaths(file, files);
  const keyExports = keyExportsFromContent(file.content);
  const dependencySentence =
    imports.length > 0 ? `Dependencies: ${imports.slice(0, 5).join(", ")}.` : "Dependencies: none parsed.";
  const relatedSentence =
    relatedFiles.length > 0
      ? `Related files: ${relatedFiles.slice(0, 5).join(", ")}.`
      : "Related files: none detected.";
  const exportsSentence =
    keyExports.length > 0
      ? `Key exports/functions: ${keyExports.slice(0, 5).join(", ")}.`
      : "Key exports/functions: none detected by lightweight parsing.";
  const readmeContext = readme ? ` README context: ${readmeExcerpt(readme)}` : "";

  return [
    `Purpose: ${role} file \`${file.path}\`${language}.`,
    exportsSentence,
    dependencySentence,
    relatedSentence,
    `Why it matters: ${whyFileMatters(file)}.${readmeContext}`,
  ].join(" ");
}

function fallbackRepoSummary(repository: GitHubRepository, files: AnalysisSummarizerFile[]): string {
  const topFiles = files.slice(0, 5).map((file) => file.path).join(", ");
  const language = repository.primaryLanguage ?? "unknown language";
  const description = repository.description ?? "No GitHub description is available";

  return `${repository.owner}/${repository.name} is a ${language} repository. ${description}. Important selected files include ${topFiles || "no selected files"}.`;
}

function fallbackArchitectureOverview(files: AnalysisSummarizerFile[]): string {
  const entrypoint = files.find((file) => file.role === "entrypoint")?.path;
  const api = files.find((file) => file.role === "api")?.path;
  const schema = files.find((file) => file.role === "schema")?.path;
  const parts = [
    entrypoint ? `Entry point: ${entrypoint}.` : null,
    api ? `API surface: ${api}.` : null,
    schema ? `Data/schema area: ${schema}.` : null,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" ");
  }

  return `Architecture overview is based on selected files: ${files
    .slice(0, 5)
    .map((file) => file.path)
    .join(", ") || "none"}.`;
}

function fallbackLearningPath(files: AnalysisSummarizerFile[]): string[] {
  const steps: string[] = [];
  const readme = files.find((file) => file.role === "readme");
  const entrypoint = files.find((file) => file.role === "entrypoint");
  const component = files.find((file) => file.role === "component");
  const api = files.find((file) => file.role === "api");
  const config = files.find((file) => file.role === "config");

  if (readme) {
    steps.push(`Start with ${readme.path} for the project overview.`);
  }
  if (entrypoint) {
    steps.push(`Read ${entrypoint.path} to understand an entry point.`);
  }
  if (component) {
    steps.push(`Review ${component.path} to see a component.`);
  }
  if (api) {
    steps.push(`Inspect ${api.path} to understand the API layer.`);
  }
  if (config) {
    steps.push(`Check ${config.path} for tooling and runtime configuration.`);
  }

  return steps.slice(0, 5);
}

function fallbackSuggestedTasks(files: AnalysisSummarizerFile[]): SuggestedTask[] {
  const tasks: SuggestedTask[] = [];
  const selectedPaths = new Set(files.map((file) => file.path));
  const readme = files.find((file) => file.role === "readme");
  const todoFiles = files.filter((file) => /\bTODO\b/i.test(file.content));
  const testFiles = files.filter((file) => file.role === "test");
  const sourceFiles = files.filter((file) => ["entrypoint", "component", "api", "source"].includes(file.role));
  const config = files.find((file) => file.role === "config");

  if (readme) {
    tasks.push({
      title: "Improve README setup notes",
      reason: `${readme.path} is available and is the first onboarding file new contributors read.`,
      paths: [readme.path],
    });
  }

  if (todoFiles.length > 0) {
    tasks.push({
      title: "Address TODO comments",
      reason: "Selected files contain TODO comments that can become focused beginner tasks.",
      paths: todoFiles.slice(0, 3).map((file) => file.path),
    });
  }

  if (sourceFiles.length > 0 && testFiles.length === 0) {
    tasks.push({
      title: "Add tests around selected source files",
      reason: "No selected test files were found alongside the important source files.",
      paths: [sourceFiles[0].path],
    });
  }

  if (config) {
    tasks.push({
      title: "Document project configuration",
      reason: `${config.path} controls tooling or runtime behavior and is useful for onboarding.`,
      paths: [config.path],
    });
  }

  for (const file of sourceFiles) {
    if (tasks.length >= 5) {
      break;
    }
    tasks.push({
      title: `Explain ${file.path}`,
      reason: `${file.path} is selected as an important ${file.role} file.`,
      paths: [file.path],
    });
  }

  return tasks
    .filter((task) => task.paths.every((taskPath) => selectedPaths.has(taskPath)))
    .slice(0, 5);
}

function sanitizeSuggestedTasks(tasks: SuggestedTask[], files: AnalysisSummarizerFile[]): SuggestedTask[] {
  const selectedPaths = new Set(files.map((file) => file.path));
  const sanitized = tasks
    .map((task) => ({
      title: task.title,
      reason: task.reason,
      paths: task.paths.filter((taskPath) => selectedPaths.has(taskPath)),
    }))
    .filter((task) => task.title && task.reason && task.paths.length > 0)
    .slice(0, 5);

  return sanitized.length >= 3 ? sanitized : fallbackSuggestedTasks(files);
}

function relatedFilePaths(file: AnalysisSummarizerFile, files: AnalysisSummarizerFile[]): string[] {
  const filePathSet = new Set(files.map((candidate) => normalizePath(candidate.path)));
  const sourceDirectory = path.posix.dirname(normalizePath(file.path));

  return importSpecifiers(file)
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => resolveRelativeImport(sourceDirectory, specifier, filePathSet))
    .filter((relatedPath): relatedPath is string => relatedPath !== null)
    .filter(unique)
    .sort();
}

function resolveRelativeImport(
  sourceDirectory: string,
  specifier: string,
  filePathSet: Set<string>,
): string | null {
  const basePath = path.posix.normalize(path.posix.join(sourceDirectory, specifier));
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    `${basePath}.json`,
    `${basePath}/index.ts`,
    `${basePath}/index.tsx`,
    `${basePath}/index.js`,
    `${basePath}/index.jsx`,
  ];

  return candidates.find((candidate) => filePathSet.has(candidate)) ?? null;
}

function importSpecifiers(file: AnalysisSummarizerFile): string[] {
  return parseImports(file)
    .map((parsedImport) => parsedImport.specifier)
    .filter(unique)
    .sort();
}

function keyExportsFromContent(content: string): string[] {
  const names = new Set<string>();
  const exportPattern =
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)\s+([A-Za-z0-9_$]+)/g;
  const functionPattern = /function\s+([A-Za-z0-9_$]+)\s*\(/g;

  for (const match of content.matchAll(exportPattern)) {
    names.add(match[1]);
  }

  for (const match of content.matchAll(functionPattern)) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function whyFileMatters(file: AnalysisSummarizerFile): string {
  switch (file.role) {
    case "readme":
      return "it introduces the project to new readers";
    case "entrypoint":
      return "it is a starting point for understanding runtime flow";
    case "component":
      return "it defines user-facing UI behavior";
    case "api":
      return "it handles request/response behavior";
    case "config":
      return "it controls project tooling or runtime configuration";
    case "schema":
      return "it describes data shape or persistence behavior";
    case "test":
      return "it documents expected behavior through tests";
    case "source":
      return "it contributes core implementation logic";
  }
}

function assertFileSummaryResponse(response: FileSummaryResponse): void {
  if (typeof response?.summary !== "string" || response.summary.trim() === "") {
    throw new Error("AI file summary response did not match the expected shape.");
  }
}

function assertRepositoryAnalysisResponse(response: RepositoryAnalysisResponse): void {
  if (
    typeof response?.repoSummary !== "string" ||
    typeof response.architectureOverview !== "string" ||
    !Array.isArray(response.learningPath) ||
    !Array.isArray(response.suggestedTasks)
  ) {
    throw new Error("AI repository analysis response did not match the expected shape.");
  }
}

function humanizeRole(role: FileRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function readmeExcerpt(readme: string): string {
  return readme
    .replace(/[#*_`>[\]()-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function unique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown provider error";
}
