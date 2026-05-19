import { describe, expect, it, vi } from "vitest";

import {
  createAnalysisIntelligenceService,
  createFallbackAnalysisIntelligenceService,
} from "./analysis-summarizer";

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
    content: "# next.js\nA framework for React.",
  },
  {
    path: "src/app/page.tsx",
    role: "entrypoint" as const,
    language: "TypeScript React",
    content: "import Header from './header';\n// TODO: add tests\nexport default function Page() {}",
  },
  {
    path: "src/app/header.tsx",
    role: "component" as const,
    language: "TypeScript React",
    content: "export default function Header() {}",
  },
];

describe("analysis intelligence service", () => {
  it("creates deterministic fallback file and repo-level summaries from grounded context", async () => {
    const service = createFallbackAnalysisIntelligenceService();

    const result = await service.generateAnalysis({
      repository,
      readme: "# next.js\nA framework for React.",
      files,
    });

    expect(result.fileSummaries.get("src/app/page.tsx")).toContain(
      "Purpose: Entrypoint file `src/app/page.tsx` in TypeScript React.",
    );
    expect(result.fileSummaries.get("src/app/page.tsx")).toContain("Dependencies: ./header.");
    expect(result.fileSummaries.get("src/app/page.tsx")).toContain("Related files: src/app/header.tsx.");
    expect(result.repoSummary).toContain("vercel/next.js");
    expect(result.repoSummary).toContain("README.md");
    expect(result.architectureOverview).toContain("src/app/page.tsx");
    expect(result.learningPath).toEqual([
      "Start with README.md for the project overview.",
      "Read src/app/page.tsx to understand an entry point.",
      "Review src/app/header.tsx to see a component.",
    ]);
    expect(result.suggestedTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Add tests around selected source files",
          paths: ["src/app/page.tsx"],
        }),
        expect.objectContaining({
          title: "Address TODO comments",
          paths: ["src/app/page.tsx"],
        }),
      ]),
    );
    expect(result.suggestedTasks.length).toBeGreaterThanOrEqual(3);
    expect(result.suggestedTasks.length).toBeLessThanOrEqual(5);
  });

  it("uses the provider for structured summaries when available", async () => {
    const provider = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce({ summary: "AI file summary" })
        .mockResolvedValueOnce({ summary: "AI README summary" })
        .mockResolvedValueOnce({
          repoSummary: "AI repo summary referencing README.md",
          architectureOverview: "AI architecture referencing src/app/page.tsx",
          learningPath: ["Read README.md", "Read src/app/page.tsx"],
          suggestedTasks: [
            {
              title: "Improve tests",
              reason: "src/app/page.tsx has a TODO about tests.",
              paths: ["src/app/page.tsx"],
            },
            {
              title: "Document README setup",
              reason: "README.md is the onboarding entry point.",
              paths: ["README.md"],
            },
            {
              title: "Explain the app entry point",
              reason: "src/app/page.tsx is selected as an entrypoint.",
              paths: ["src/app/page.tsx"],
            },
          ],
        }),
    };
    const service = createAnalysisIntelligenceService({ provider });

    const result = await service.generateAnalysis({
      repository,
      readme: "# next.js\nA framework for React.",
      files: files.slice(0, 2),
    });

    expect(provider.generateJson).toHaveBeenCalledTimes(3);
    expect(result.fileSummaries.get("README.md")).toBe("AI file summary");
    expect(result.fileSummaries.get("src/app/page.tsx")).toBe("AI README summary");
    expect(result.repoSummary).toBe("AI repo summary referencing README.md");
    expect(result.suggestedTasks).toEqual([
      {
        title: "Improve tests",
        reason: "src/app/page.tsx has a TODO about tests.",
        paths: ["src/app/page.tsx"],
      },
      {
        title: "Document README setup",
        reason: "README.md is the onboarding entry point.",
        paths: ["README.md"],
      },
      {
        title: "Explain the app entry point",
        reason: "src/app/page.tsx is selected as an entrypoint.",
        paths: ["src/app/page.tsx"],
      },
    ]);
  });

  it("falls back when provider generation fails", async () => {
    const provider = {
      generateJson: vi.fn().mockRejectedValue(new Error("model unavailable")),
    };
    const service = createAnalysisIntelligenceService({ provider });

    const result = await service.generateAnalysis({
      repository,
      readme: "# next.js\nA framework for React.",
      files,
    });

    expect(result.repoSummary).toContain("vercel/next.js");
    expect(result.metadata.provider).toBe("fallback");
    expect(result.metadata.fallbackReason).toBe("model unavailable");
  });
});
