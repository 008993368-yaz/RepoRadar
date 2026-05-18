import { createApiError, createApiSuccess } from "@/lib/api-response";
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
    const database = getRepoDatabase();
    const repository = await upsertRepository(database, {
      owner: repo.owner,
      name: repo.repo,
      url: repo.normalizedUrl,
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

    if (error instanceof AppDatabaseError) {
      return Response.json(createApiError(error.code, error.message), { status: 500 });
    }

    throw error;
  }
}
