import { createApiError, createApiSuccess } from "@/lib/api-response";
import { GitHubRepoInputError, parseGitHubRepoInput } from "@/lib/github-url";

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
    const repoId = `${repo.owner}-${repo.repo}`;

    return Response.json(
      createApiSuccess({
        repoId,
        jobId: `stub-job-${repoId}`,
        status: "queued",
      }),
    );
  } catch (error) {
    if (error instanceof GitHubRepoInputError) {
      return Response.json(createApiError(error.code, error.message), { status: 400 });
    }

    throw error;
  }
}
