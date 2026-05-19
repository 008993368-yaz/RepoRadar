export type GitHubApiErrorCode =
  | "invalid_repo"
  | "not_found"
  | "private_repo"
  | "rate_limited"
  | "github_api_error"
  | "network_error";

export type GitHubRepository = {
  owner: string;
  name: string;
  url: string;
  description: string | null;
  stars: number | null;
  forks: number | null;
  defaultBranch: string;
  primaryLanguage: string | null;
  license: string | null;
};

export type GitHubFileTreeEntry = {
  path: string;
  sha: string;
  size: number | null;
  url: string;
};

export type GitHubRepositorySnapshot = {
  repository: GitHubRepository;
  readme: string | null;
  tree: GitHubFileTreeEntry[];
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type GitHubClientOptions = {
  fetchImpl?: FetchLike;
  token?: string;
  baseUrl?: string;
};

type GitHubRepositoryResponse = {
  owner?: { login?: unknown };
  name?: unknown;
  html_url?: unknown;
  description?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  default_branch?: unknown;
  language?: unknown;
  license?: { spdx_id?: unknown; name?: unknown } | null;
};

type GitHubTreeResponse = {
  tree?: Array<{
    path?: unknown;
    type?: unknown;
    sha?: unknown;
    size?: unknown;
    url?: unknown;
  }>;
};

export class GitHubApiError extends Error {
  constructor(
    public readonly code: GitHubApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export function createGitHubClient(options: GitHubClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  const token = options.token ?? process.env.GITHUB_TOKEN;

  async function fetchRepository(owner: string, repo: string): Promise<GitHubRepository> {
    const response = await requestJson<GitHubRepositoryResponse>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}`,
    );

    if (typeof response.owner?.login !== "string" || typeof response.name !== "string") {
      throw new GitHubApiError("github_api_error", "GitHub returned an unexpected repository response.");
    }

    return {
      owner: response.owner.login,
      name: response.name,
      url: stringOrFallback(response.html_url, `https://github.com/${owner}/${repo}`),
      description: nullableString(response.description),
      stars: nullableNumber(response.stargazers_count),
      forks: nullableNumber(response.forks_count),
      defaultBranch: stringOrFallback(response.default_branch, "main"),
      primaryLanguage: nullableString(response.language),
      license: normalizeLicense(response.license),
    };
  }

  async function fetchReadme(owner: string, repo: string): Promise<string | null> {
    const path = `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/readme`;
    const response = await request(path, "application/vnd.github.raw", { nullableNotFound: true });

    if (!response) {
      return null;
    }

    return response.text();
  }

  async function fetchFileTree(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubFileTreeEntry[]> {
    const response = await requestJson<GitHubTreeResponse>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/git/trees/${encodeSegment(branch)}?recursive=1`,
    );

    return (response.tree ?? [])
      .filter((entry) => entry.type === "blob")
      .map((entry) => ({
        path: stringOrFallback(entry.path, ""),
        sha: stringOrFallback(entry.sha, ""),
        size: nullableNumber(entry.size),
        url: stringOrFallback(entry.url, ""),
      }))
      .filter((entry) => entry.path && entry.sha && entry.url);
  }

  async function fetchRawFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string> {
    const encodedPath = path.split("/").map(encodeSegment).join("/");
    const response = await request(
      `/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/contents/${encodedPath}?ref=${encodeSegment(ref)}`,
      "application/vnd.github.raw",
    );

    return response.text();
  }

  async function fetchRepositorySnapshot(
    owner: string,
    repo: string,
  ): Promise<GitHubRepositorySnapshot> {
    const repository = await fetchRepository(owner, repo);
    const readme = await fetchReadme(owner, repo);
    const tree = await fetchFileTree(owner, repo, repository.defaultBranch);

    return {
      repository,
      readme,
      tree,
    };
  }

  async function requestJson<TResponse>(path: string): Promise<TResponse> {
    const response = await request(path, "application/vnd.github+json");
    return response.json() as Promise<TResponse>;
  }

  function request(path: string, accept: string): Promise<Response>;
  function request(
    path: string,
    accept: string,
    options: { nullableNotFound: true },
  ): Promise<Response | null>;
  async function request(
    path: string,
    accept: string,
    options: { nullableNotFound?: boolean } = {},
  ): Promise<Response | null> {
    let response: Response;

    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        headers: buildHeaders(accept, token),
      });
    } catch {
      throw new GitHubApiError("network_error", "Unable to reach GitHub. Try again later.");
    }

    if (options.nullableNotFound && response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw await errorFromResponse(response);
    }

    return response;
  }

  return {
    fetchRepository,
    fetchReadme,
    fetchFileTree,
    fetchRawFileContent,
    fetchRepositorySnapshot,
  };
}

function buildHeaders(accept: string, token?: string): HeadersInit {
  return {
    Accept: accept,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "RepoRadar",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function errorFromResponse(response: Response): Promise<GitHubApiError> {
  const code = codeFromStatus(response.status);
  const message = await responseMessage(response);

  return new GitHubApiError(code, message);
}

function codeFromStatus(status: number): GitHubApiErrorCode {
  if (status === 400 || status === 422) {
    return "invalid_repo";
  }

  if (status === 404) {
    return "not_found";
  }

  if (status === 403) {
    return "private_repo";
  }

  if (status === 429) {
    return "rate_limited";
  }

  return "github_api_error";
}

async function responseMessage(response: Response) {
  let message = "GitHub API request failed.";

  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) {
      message = body.message;
    }
  } catch {
    // Keep the generic message when GitHub sends a non-JSON error body.
  }

  if (response.status === 403) {
    return "Repository is private or GitHub denied access.";
  }

  if (response.status === 429) {
    return "GitHub rate limit reached. Try again later or configure GITHUB_TOKEN.";
  }

  if (response.status === 404) {
    return "Repository not found.";
  }

  return message;
}

function normalizeLicense(license: GitHubRepositoryResponse["license"]): string | null {
  if (!license) {
    return null;
  }

  if (typeof license.spdx_id === "string" && license.spdx_id && license.spdx_id !== "NOASSERTION") {
    return license.spdx_id;
  }

  return nullableString(license.name);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}
