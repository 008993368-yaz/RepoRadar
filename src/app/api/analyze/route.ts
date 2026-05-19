import { createApiError, createApiSuccess } from "@/lib/api-response";
import { createGitHubClient, GitHubApiError, type GitHubApiErrorCode } from "@/lib/github-client";
import { GitHubRepoInputError, parseGitHubRepoInput } from "@/lib/github-url";
import {
  AppDatabaseError,
  createAnalysisJob,
  getRepoDatabase,
  upsertRepository,
} from "@/lib/repo-database";

type AnalyzeRequestBody = {
  repoUrl?: unknown;
};

export async function POST(request: Request) {
  let body: AnalyzeRequestBody;

  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return Response.json(
      createApiError("invalid_repo_url", "Enter a GitHub repository like vercel/next.js."),
      { status: 400 },
    );
  }

  try {
    if (typeof body.repoUrl !== "string") {
      throw new GitHubRepoInputError();
    }

    const repo = parseGitHubRepoInput(body.repoUrl);
    const github = createGitHubClient();
    const githubRepository = await github.fetchRepository(repo.owner, repo.repo);
    const readme = await github.fetchReadme(repo.owner, repo.repo);
    const database = getRepoDatabase();
    const repository = await upsertRepository(database, {
      owner: githubRepository.owner,
      name: githubRepository.name,
      url: githubRepository.url,
      description: githubRepository.description,
      default_branch: githubRepository.defaultBranch,
      primary_language: githubRepository.primaryLanguage,
      stars: githubRepository.stars,
      forks: githubRepository.forks,
      license: githubRepository.license,
      readme,
    });
    const job = await createAnalysisJob(database, repository.id);

    return Response.json(
      createApiSuccess({
        repoId: repository.id,
        jobId: job.id,
        status: job.status,
      }),
    );
  } catch (error) {
    if (error instanceof GitHubRepoInputError) {
      return Response.json(createApiError(error.code, error.message), { status: 400 });
    }

    if (error instanceof GitHubApiError) {
      return Response.json(createApiError(error.code, error.message), {
        status: githubErrorStatus(error.code),
      });
    }

    if (error instanceof AppDatabaseError) {
      return Response.json(createApiError(error.code, error.message), { status: 500 });
    }

    throw error;
  }
}

function githubErrorStatus(code: GitHubApiErrorCode) {
  if (code === "invalid_repo") {
    return 400;
  }

  if (code === "not_found") {
    return 404;
  }

  if (code === "private_repo") {
    return 403;
  }

  if (code === "rate_limited") {
    return 429;
  }

  return 502;
}
