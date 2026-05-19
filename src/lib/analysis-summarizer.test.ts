import { describe, expect, it } from "vitest";

import { createFallbackAnalysisSummarizer } from "./analysis-summarizer";

describe("fallback analysis summarizer", () => {
  it("creates deterministic file summaries from grounded file metadata", async () => {
    const summarizer = createFallbackAnalysisSummarizer();

    const summaries = await summarizer.summarizeFiles({
      repository: {
        owner: "vercel",
        name: "next.js",
        url: "https://github.com/vercel/next.js",
        description: "The React Framework",
        stars: 1,
        forks: 2,
        defaultBranch: "canary",
        primaryLanguage: "TypeScript",
        license: "MIT",
      },
      readme: "# next.js\nA framework for React.",
      files: [
        {
          path: "src/app/page.tsx",
          role: "entrypoint",
          language: "TypeScript React",
          content: "import Header from './header';\nexport default function Page() {}",
        },
      ],
    });

    expect(summaries).toEqual(
      new Map([
        [
          "src/app/page.tsx",
          "Entrypoint file `src/app/page.tsx` in TypeScript React. It imports ./header. README context: next.js A framework for React.",
        ],
      ]),
    );
  });
});
