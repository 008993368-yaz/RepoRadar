import {
  createAnalysisFailedError,
  createAnalysisIncompleteError,
  mapGraphData,
} from "@/lib/dashboard-api";
import { createApiError, createApiSuccess } from "@/lib/api-response";
import {
  AppDatabaseError,
  findLatestAnalysisJob,
  findRepositoryById,
  getRepoDatabase,
  listGraphEdges,
  listGraphNodes,
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

    const [nodes, edges] = await Promise.all([
      listGraphNodes(database, repoId),
      listGraphEdges(database, repoId),
    ]);

    if (nodes.length === 0) {
      const error = createAnalysisIncompleteError(repoId, job);
      return Response.json(createApiError(error.code, error.message, error.details), {
        status: 409,
      });
    }

    return Response.json(createApiSuccess(mapGraphData(nodes, edges)));
  } catch (error) {
    if (error instanceof AppDatabaseError) {
      return Response.json(createApiError(error.code, error.message), { status: 500 });
    }

    throw error;
  }
}
