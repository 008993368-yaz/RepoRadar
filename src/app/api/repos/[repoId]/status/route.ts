import { createApiError, createApiSuccess } from "@/lib/api-response";
import { mapStatusData } from "@/lib/dashboard-api";
import {
  AppDatabaseError,
  findLatestAnalysisJob,
  findLatestAnalysisOutput,
  findRepositoryById,
  getRepoDatabase,
} from "@/lib/repo-database";

type RepoRouteContext = {
  params: Promise<{ repoId: string }>;
};

export async function GET(_request: Request, context: RepoRouteContext) {
  const { repoId } = await context.params;

  try {
    const database = getRepoDatabase();
    const repo = await findRepositoryById(database, repoId);

    if (!repo) {
      return Response.json(
        createApiError("repo_not_found", "Repository analysis was not found.", { repoId }),
        { status: 404 },
      );
    }

    const [job, output] = await Promise.all([
      findLatestAnalysisJob(database, repoId),
      findLatestAnalysisOutput(database, repoId),
    ]);

    return Response.json(createApiSuccess(mapStatusData({ repoId, repo, job, output })));
  } catch (error) {
    if (error instanceof AppDatabaseError) {
      return Response.json(createApiError(error.code, error.message), { status: 500 });
    }

    throw error;
  }
}
