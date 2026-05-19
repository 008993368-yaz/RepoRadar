import { describe, expect, it } from "vitest";

import {
  buildRepoChatPromptContext,
  buildRepositoryPromptContext,
  createBeginnerTasksPrompt,
  createFileSummaryPrompt,
  suggestedTasksSchema,
} from "./ai-prompts";

const repository = {
  owner: "vercel",
  name: "next.js",
  url: "https://github.com/vercel/next.js",
  description: "The React Framework",
  stars: 1,
  forks: 2,
  defaultBranch: "canary",
  primaryLanguage: "TypeScript",
  license: "MIT",
};

const files = [
  {
    path: "README.md",
    role: "readme" as const,
    language: "Markdown",
    content: `# Repo\n${"A".repeat(4_500)}`,
  },
  {
    path: "src/app/page.tsx",
    role: "entrypoint" as const,
    language: "TypeScript React",
    content: `import Header from './header';\n// TODO: add tests\n${"B".repeat(2_500)}`,
    summary: "Main page file summary",
  },
  {
    path: "src/app/header.tsx",
    role: "component" as const,
    language: "TypeScript React",
    content: "export default function Header() {}",
    summary: "Header file summary",
  },
];

describe("AI prompt helpers", () => {
  it("builds bounded repository context from real paths and excerpts", () => {
    const context = buildRepositoryPromptContext({
      repository,
      readme: files[0].content,
      files,
      fileSummaries: new Map(files.map((file) => [file.path, file.summary ?? "Readme summary"])),
    });

    expect(context).toContain("Repository: vercel/next.js");
    expect(context).toContain("README.md");
    expect(context).toContain("src/app/page.tsx");
    expect(context).toContain("TODO: add tests");
    expect(context).not.toContain("B".repeat(2_001));
    expect(context).not.toContain("A".repeat(4_001));
  });

  it("creates file summary prompts that forbid ungrounded assumptions", () => {
    const prompt = createFileSummaryPrompt({
      repository,
      readme: "# Repo",
      file: files[1],
      relatedFiles: ["src/app/header.tsx"],
    });

    expect(prompt.instructions).toContain("Use only the provided repository context");
    expect(prompt.input).toContain("src/app/page.tsx");
    expect(prompt.input).toContain("src/app/header.tsx");
    expect(prompt.schema.required).toEqual(["summary"]);
  });

  it("creates beginner task prompts with a strict task schema", () => {
    const prompt = createBeginnerTasksPrompt("Repository context");

    expect(prompt.instructions).toContain("Use only the provided repository context");
    expect(prompt.schema).toBe(suggestedTasksSchema);
    expect(suggestedTasksSchema.properties.tasks.items.required).toEqual([
      "title",
      "reason",
      "paths",
    ]);
  });

  it("builds repo chat prompt context with stored analysis and citations", () => {
    const context = buildRepoChatPromptContext({
      repo: {
        id: "repo-uuid",
        owner: "vercel",
        name: "next.js",
        url: "https://github.com/vercel/next.js",
        description: "The React Framework",
        default_branch: "canary",
        primary_language: "TypeScript",
        stars: 1,
        forks: 2,
        license: "MIT",
        readme: "# Repo",
        created_at: "2026-05-18T20:00:00.000Z",
        updated_at: "2026-05-18T20:00:00.000Z",
      },
      analysisOutput: {
        repo_summary: "Repo summary",
        architecture_overview: "Architecture overview",
        learning_path: ["Read README.md"],
        suggested_tasks: [{ title: "Add tests", reason: "TODO found", paths: ["src/app/page.tsx"] }],
      },
      files: [
        {
          id: "file-page",
          repo_id: "repo-uuid",
          path: "src/app/page.tsx",
          language: "TypeScript React",
          size_bytes: 100,
          content_hash: "hash",
          summary: "Main page file summary",
          role: "entrypoint",
          created_at: "2026-05-18T20:00:00.000Z",
        },
      ],
      graphNodes: [],
      question: "What file should I read first?",
    });

    expect(context).toContain("Question: What file should I read first?");
    expect(context).toContain("Repo summary");
    expect(context).toContain("src/app/page.tsx");
  });
});
