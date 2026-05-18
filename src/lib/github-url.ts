const GITHUB_REPO_ERROR_MESSAGE = "Enter a GitHub repository like vercel/next.js.";
const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_PATTERN = /^[a-zA-Z0-9._-]+$/;

export type ParsedGitHubRepo = {
  owner: string;
  repo: string;
  normalizedUrl: string;
};

export class GitHubRepoInputError extends Error {
  code = "invalid_repo_url" as const;

  constructor(message = GITHUB_REPO_ERROR_MESSAGE) {
    super(message);
    this.name = "GitHubRepoInputError";
  }
}

export function parseGitHubRepoInput(input: string): ParsedGitHubRepo {
  const value = input.trim();

  if (!value) {
    throw new GitHubRepoInputError();
  }

  const path = value.includes("://") || value.startsWith("github.com/")
    ? parseGitHubUrlPath(value)
    : value;
  const parts = path.split("/").filter(Boolean);

  if (parts.length !== 2) {
    throw new GitHubRepoInputError();
  }

  const [owner, repo] = parts;

  if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) {
    throw new GitHubRepoInputError();
  }

  return {
    owner,
    repo,
    normalizedUrl: `https://github.com/${owner}/${repo}`,
  };
}

function parseGitHubUrlPath(value: string) {
  let url: URL;

  try {
    url = new URL(value.startsWith("github.com/") ? `https://${value}` : value);
  } catch {
    throw new GitHubRepoInputError();
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new GitHubRepoInputError();
  }

  return url.pathname;
}
