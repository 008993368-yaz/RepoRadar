import {
  createAnalysisFailedError,
  createAnalysisIncompleteError,
  mapDashboardData,
} from "@/lib/dashboard-api";
import { createApiError, createApiSuccess } from "@/lib/api-response";
import {
  AppDatabaseError,
  findLatestAnalysisJob,
  findLatestAnalysisOutput,
  findRepositoryById,
  getRepoDatabase,
  listRepoFiles,
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

    const job = await findLatestAnalysisJob(database, repoId);
    if (job?.status === "failed") {
      const error = createAnalysisFailedError(job);
      return Response.json(createApiError(error.code, error.message, error.details), {
        status: 409,
      });
    }

    const [output, files] = await Promise.all([
      findLatestAnalysisOutput(database, repoId),
      listRepoFiles(database, repoId),
    ]);

    if (job?.status === "completed" && !output) {
      const error = createAnalysisIncompleteError(repoId, job);
      return Response.json(createApiError(error.code, error.message, error.details), {
        status: 409,
      });
    }

    return Response.json(createApiSuccess(mapDashboardData({ repo, job, output, files })));
  } catch (error) {
    if (error instanceof AppDatabaseError) {
      return Response.json(createApiError(error.code, error.message), { status: 500 });
    }

    throw error;
  }
}
