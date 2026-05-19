import { analyzeRepository, AnalysisPipelineError } from "@/lib/analysis-service";
import { createApiError, createApiSuccess } from "@/lib/api-response";
import { GitHubApiError, type GitHubApiErrorCode } from "@/lib/github-client";
import { GitHubRepoInputError, parseGitHubRepoInput } from "@/lib/github-url";
import { AppDatabaseError } from "@/lib/repo-database";

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

    parseGitHubRepoInput(body.repoUrl);
    const analysis = await analyzeRepository(body.repoUrl);

    return Response.json(createApiSuccess(analysis));
  } catch (error) {
    if (error instanceof GitHubRepoInputError) {
      return Response.json(createApiError(error.code, error.message), { status: 400 });
    }

    if (error instanceof GitHubApiError) {
      return Response.json(createApiError(error.code, error.message), {
        status: githubErrorStatus(error.code),
      });
    }

    if (error instanceof AnalysisPipelineError) {
      return Response.json(
        createApiError(error.code, error.message, {
          repoId: error.repoId,
          jobId: error.jobId,
        }),
        { status: 500 },
      );
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
