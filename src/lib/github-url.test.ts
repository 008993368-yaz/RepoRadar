import { describe, expect, it } from "vitest";

import { GitHubRepoInputError, parseGitHubRepoInput } from "./github-url";

describe("parseGitHubRepoInput", () => {
  it.each([
    [
      "https://github.com/vercel/next.js",
      { owner: "vercel", repo: "next.js", normalizedUrl: "https://github.com/vercel/next.js" },
    ],
    [
      "github.com/vercel/next.js",
      { owner: "vercel", repo: "next.js", normalizedUrl: "https://github.com/vercel/next.js" },
    ],
    [
      "vercel/next.js",
      { owner: "vercel", repo: "next.js", normalizedUrl: "https://github.com/vercel/next.js" },
    ],
    [
      " example-owner/repo_name.with-dots ",
      {
        owner: "example-owner",
        repo: "repo_name.with-dots",
        normalizedUrl: "https://github.com/example-owner/repo_name.with-dots",
      },
    ],
  ])("parses %s", (input, expected) => {
    expect(parseGitHubRepoInput(input)).toEqual(expected);
  });

  it.each([
    "",
    "   ",
    "https://gitlab.com/vercel/next.js",
    "github.com/vercel",
    "vercel",
    "github.com/vercel/next.js/issues",
    "https://github.com/vercel/next.js/tree/main",
    "bad owner/next.js",
    "vercel/bad repo",
  ])("rejects %s", (input) => {
    expect(() => parseGitHubRepoInput(input)).toThrow(GitHubRepoInputError);
    expect(() => parseGitHubRepoInput(input)).toThrow(
      "Enter a GitHub repository like vercel/next.js.",
    );
  });
});
