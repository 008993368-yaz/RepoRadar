import { parseImports } from "./import-parser";
import type { FileRole } from "./file-selection";
import type { GitHubRepository } from "./github-client";

export type AnalysisSummarizerFile = {
  path: string;
  role: FileRole;
  language: string | null;
  content: string;
};

export type SummarizeFilesInput = {
  repository: GitHubRepository;
  readme: string | null;
  files: AnalysisSummarizerFile[];
};

export type AnalysisSummarizer = {
  summarizeFiles(input: SummarizeFilesInput): Promise<Map<string, string>>;
};

export function createFallbackAnalysisSummarizer(): AnalysisSummarizer {
  return {
    async summarizeFiles(input) {
      return new Map(
        input.files.map((file) => [file.path, summarizeFile(input.repository, input.readme, file)]),
      );
    },
  };
}

function summarizeFile(
  _repository: GitHubRepository,
  readme: string | null,
  file: AnalysisSummarizerFile,
): string {
  const role = humanizeRole(file.role);
  const language = file.language ? ` in ${file.language}` : "";
  const imports = parseImports(file)
    .map((parsedImport) => parsedImport.specifier)
    .filter(unique)
    .sort();
  const importSentence =
    imports.length > 0 ? ` It imports ${imports.slice(0, 5).join(", ")}.` : " It has no parsed imports.";
  const readmeContext = readme ? ` README context: ${readmeExcerpt(readme)}` : "";

  return `${role} file \`${file.path}\`${language}.${importSentence}${readmeContext}`;
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

function unique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}
