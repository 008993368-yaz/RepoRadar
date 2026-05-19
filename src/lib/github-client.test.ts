import { describe, expect, it, vi } from "vitest";

import { createGitHubClient, GitHubApiError } from "./github-client";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("GitHub client", () => {
  it("maps repository metadata from the GitHub REST API", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        owner: { login: "vercel" },
        name: "next.js",
        html_url: "https://github.com/vercel/next.js",
        description: "The React Framework",
        stargazers_count: 123,
        forks_count: 45,
        default_branch: "canary",
        language: "TypeScript",
        license: { spdx_id: "MIT" },
      }),
    );
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(client.fetchRepository("vercel", "next.js")).resolves.toEqual({
      owner: "vercel",
      name: "next.js",
      url: "https://github.com/vercel/next.js",
      description: "The React Framework",
      stars: 123,
      forks: 45,
      defaultBranch: "canary",
      primaryLanguage: "TypeScript",
      license: "MIT",
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.github.test/repos/vercel/next.js", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RepoRadar",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  });

  it("returns README text and treats a missing README as nullable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("# RepoRadar"))
      .mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, { status: 404 }));
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(client.fetchReadme("vercel", "next.js")).resolves.toBe("# RepoRadar");
    await expect(client.fetchReadme("vercel", "next.js")).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.github.test/repos/vercel/next.js/readme",
      {
        headers: {
          Accept: "application/vnd.github.raw",
          "User-Agent": "RepoRadar",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
  });

  it("maps recursive file tree blobs for a branch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        tree: [
          { path: "src/app/page.tsx", mode: "100644", type: "blob", sha: "abc", size: 321, url: "blob-url" },
          { path: "src", mode: "040000", type: "tree", sha: "def", url: "tree-url" },
        ],
      }),
    );
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(client.fetchFileTree("vercel", "next.js", "canary")).resolves.toEqual([
      { path: "src/app/page.tsx", sha: "abc", size: 321, url: "blob-url" },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.test/repos/vercel/next.js/git/trees/canary?recursive=1",
      expect.any(Object),
    );
  });

  it("fetches raw file content with encoded path segments and ref", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("export default function Page() {}"));
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(
      client.fetchRawFileContent("owner name", "repo.name", "src/app/[repoId]/page.tsx", "feature/main"),
    ).resolves.toBe("export default function Page() {}");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.test/repos/owner%20name/repo.name/contents/src/app/%5BrepoId%5D/page.tsx?ref=feature%2Fmain",
      {
        headers: {
          Accept: "application/vnd.github.raw",
          "User-Agent": "RepoRadar",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
  });

  it("includes an authorization header when a token is provided", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ tree: [] }));
    const client = createGitHubClient({
      fetchImpl,
      token: "ghp_secret",
      baseUrl: "https://api.github.test",
    });

    await client.fetchFileTree("vercel", "next.js", "main");
    expect(fetchImpl).toHaveBeenCalledWith(expect.any(String), {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer ghp_secret",
        "User-Agent": "RepoRadar",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  });

  it.each([
    [404, "not_found"],
    [403, "private_repo"],
    [429, "rate_limited"],
    [500, "github_api_error"],
  ] as const)("normalizes status %s to %s", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: "GitHub said no" }, { status }));
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(client.fetchRepository("vercel", "next.js")).rejects.toMatchObject({
      code,
      message: expect.any(String),
    });
  });

  it("normalizes fetch failures as network errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(client.fetchRepository("vercel", "next.js")).rejects.toBeInstanceOf(GitHubApiError);
    await expect(client.fetchRepository("vercel", "next.js")).rejects.toMatchObject({
      code: "network_error",
    });
  });

  it("fetches a repository snapshot with metadata, README, and tree", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          owner: { login: "vercel" },
          name: "next.js",
          html_url: "https://github.com/vercel/next.js",
          description: null,
          stargazers_count: 1,
          forks_count: 2,
          default_branch: "main",
          language: null,
          license: null,
        }),
      )
      .mockResolvedValueOnce(new Response("# next.js"))
      .mockResolvedValueOnce(jsonResponse({ tree: [] }));
    const client = createGitHubClient({ fetchImpl, baseUrl: "https://api.github.test" });

    await expect(client.fetchRepositorySnapshot("vercel", "next.js")).resolves.toEqual({
      repository: {
        owner: "vercel",
        name: "next.js",
        url: "https://github.com/vercel/next.js",
        description: null,
        stars: 1,
        forks: 2,
        defaultBranch: "main",
        primaryLanguage: null,
        license: null,
      },
      readme: "# next.js",
      tree: [],
    });
  });
});
