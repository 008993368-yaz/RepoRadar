import {
  createAnalysisIntelligenceService,
  type AnalysisIntelligenceResult,
  type AnalysisIntelligenceService,
} from "./analysis-summarizer";
import { createContentHash, selectImportantFiles, type SelectedFile } from "./file-selection";
import { buildRepositoryGraph, type GraphEngineFile, type ReactFlowGraphEdge, type ReactFlowGraphNode } from "./graph-engine";
import { createGitHubClient } from "./github-client";
import { parseGitHubRepoInput } from "./github-url";
import {
  createAnalysisJob,
  deleteGraphEdges,
  findLatestCompletedAnalysisJob,
  findRepositoryByOwnerName,
  getRepoDatabase,
  insertGraphEdges,
  insertAnalysisOutput,
  listGraphNodes,
  listRepoFiles,
  updateAnalysisJob,
  upsertFiles,
  upsertGraphNodes,
  upsertRepository,
  type AnalysisJobStatus,
  type AnalysisOutputInsert,
  type FileInsert,
  type FileRow,
  type GraphEdgeInsert,
  type GraphNodeInsert,
  type GraphNodeRow,
  type Json,
  type RepoDatabase,
} from "./repo-database";

type GitHubClient = ReturnType<typeof createGitHubClient>;

type RepoStore = {
  findRepositoryByOwnerName: typeof findRepositoryByOwnerName;
  findLatestCompletedAnalysisJob: typeof findLatestCompletedAnalysisJob;
  listRepoFiles: typeof listRepoFiles;
  listGraphNodes: typeof listGraphNodes;
  upsertRepository: typeof upsertRepository;
  createAnalysisJob: typeof createAnalysisJob;
  updateAnalysisJob: typeof updateAnalysisJob;
  upsertFiles: typeof upsertFiles;
  upsertGraphNodes: typeof upsertGraphNodes;
  deleteGraphEdges: typeof deleteGraphEdges;
  insertGraphEdges: typeof insertGraphEdges;
  insertAnalysisOutput: typeof insertAnalysisOutput;
};

export type AnalyzeRepositoryResult = {
  repoId: string;
  jobId: string;
  status: AnalysisJobStatus;
};

export class AnalysisPipelineError extends Error {
  readonly code = "analysis_failed";

  constructor(
    message: string,
    public readonly repoId: string,
    public readonly jobId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnalysisPipelineError";
  }
}

type AnalyzeRepositoryOptions = {
  database?: RepoDatabase;
  github?: GitHubClient;
  summarizer?: AnalysisIntelligenceService;
  repoStore?: RepoStore;
  now?: () => Date;
};

type FetchedAnalysisFile = GraphEngineFile & {
  sha: string;
  size: number | null;
  contentHash: string;
};

const defaultRepoStore: RepoStore = {
  findRepositoryByOwnerName,
  findLatestCompletedAnalysisJob,
  listRepoFiles,
  listGraphNodes,
  upsertRepository,
  createAnalysisJob,
  updateAnalysisJob,
  upsertFiles,
  upsertGraphNodes,
  deleteGraphEdges,
  insertGraphEdges,
  insertAnalysisOutput,
};

export async function analyzeRepository(
  repoUrl: string,
  options: AnalyzeRepositoryOptions = {},
): Promise<AnalyzeRepositoryResult> {
  const parsedRepo = parseGitHubRepoInput(repoUrl);
  const database = options.database ?? getRepoDatabase();
  const github = options.github ?? createGitHubClient();
  const summarizer = options.summarizer ?? createAnalysisIntelligenceService();
  const repoStore = options.repoStore ?? defaultRepoStore;
  const now = options.now ?? (() => new Date());

  const cachedRepo = await repoStore.findRepositoryByOwnerName(
    database,
    parsedRepo.owner,
    parsedRepo.repo,
  );
  if (cachedRepo) {
    const cachedJob = await repoStore.findLatestCompletedAnalysisJob(database, cachedRepo.id);
    if (cachedJob && (await hasCachedAnalysis(database, repoStore, cachedRepo.id))) {
      return {
        repoId: cachedRepo.id,
        jobId: cachedJob.id,
        status: cachedJob.status,
      };
    }
  }

  const repository = await github.fetchRepository(parsedRepo.owner, parsedRepo.repo);
  const readme = await github.fetchReadme(repository.owner, repository.name);
  const tree = await github.fetchFileTree(repository.owner, repository.name, repository.defaultBranch);
  const selectedFiles = selectImportantFiles(tree);
  const repoRow = await repoStore.upsertRepository(database, {
    owner: repository.owner,
    name: repository.name,
    url: repository.url,
    description: repository.description,
    default_branch: repository.defaultBranch,
    primary_language: repository.primaryLanguage,
    stars: repository.stars,
    forks: repository.forks,
    license: repository.license,
    readme,
  });
  const job = await repoStore.createAnalysisJob(database, repoRow.id);

  try {
    await repoStore.updateAnalysisJob(database, job.id, {
      status: "running",
      error_message: null,
    });

    const files = await runStage(
      "fetching file contents",
      () => fetchSelectedFiles(github, repository.owner, repository.name, repository.defaultBranch, readme, selectedFiles),
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    const intelligence = await runStage(
      "generating summaries",
      () => summarizer.generateAnalysis({ repository, readme, files }),
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    const storedFiles = await runStage(
      "storing selected files",
      () => repoStore.upsertFiles(database, toFileInserts(repoRow.id, files, intelligence.fileSummaries)),
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    const graph = await runStage(
      "building graph",
      () =>
        Promise.resolve(
          buildRepositoryGraph({
            files: withStoredFileIds(files, storedFiles, intelligence.fileSummaries),
          }),
        ),
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    const graphNodes = await runStage(
      "storing graph nodes",
      () => repoStore.upsertGraphNodes(database, toGraphNodeInserts(repoRow.id, graph.nodes)),
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    await runStage(
      "storing graph edges",
      async () => {
        await repoStore.deleteGraphEdges(database, repoRow.id);
        return repoStore.insertGraphEdges(
          database,
          toGraphEdgeInserts(repoRow.id, graph.edges, graphNodes),
        );
      },
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    await runStage(
      "storing analysis output",
      () => repoStore.insertAnalysisOutput(database, toAnalysisOutputInsert(repoRow.id, job.id, intelligence)),
      repoRow.id,
      job.id,
      database,
      repoStore,
      now,
    );
    const completedJob = await repoStore.updateAnalysisJob(database, job.id, {
      status: "completed",
      error_message: null,
      completed_at: now().toISOString(),
    });

    return {
      repoId: repoRow.id,
      jobId: completedJob.id,
      status: completedJob.status,
    };
  } catch (error) {
    if (error instanceof AnalysisPipelineError) {
      throw error;
    }

    throw await failAnalysisJob(
      database,
      repoStore,
      repoRow.id,
      job.id,
      "completed",
      error,
      now,
    );
  }
}

async function hasCachedAnalysis(
  database: RepoDatabase,
  repoStore: RepoStore,
  repoId: string,
): Promise<boolean> {
  const [files, graphNodes] = await Promise.all([
    repoStore.listRepoFiles(database, repoId),
    repoStore.listGraphNodes(database, repoId),
  ]);

  return files.length > 0 && graphNodes.length > 0;
}

async function runStage<TValue>(
  stage: string,
  action: () => Promise<TValue>,
  repoId: string,
  jobId: string,
  database: RepoDatabase,
  repoStore: RepoStore,
  now: () => Date,
): Promise<TValue> {
  try {
    return await action();
  } catch (error) {
    throw await failAnalysisJob(database, repoStore, repoId, jobId, stage, error, now);
  }
}

async function failAnalysisJob(
  database: RepoDatabase,
  repoStore: RepoStore,
  repoId: string,
  jobId: string,
  stage: string,
  error: unknown,
  now: () => Date,
): Promise<AnalysisPipelineError> {
  const message = `Analysis failed while ${stage}.`;
  await repoStore.updateAnalysisJob(database, jobId, {
    status: "failed",
    error_message: message,
    completed_at: now().toISOString(),
  });

  return new AnalysisPipelineError(message, repoId, jobId, error);
}

async function fetchSelectedFiles(
  github: GitHubClient,
  owner: string,
  repo: string,
  ref: string,
  readme: string | null,
  selectedFiles: SelectedFile[],
): Promise<FetchedAnalysisFile[]> {
  return Promise.all(
    selectedFiles.map(async (file) => {
      const content =
        file.role === "readme" && readme !== null
          ? readme
          : await github.fetchRawFileContent(owner, repo, file.path, ref);

      return {
        path: file.path,
        sha: file.sha,
        role: file.role,
        language: file.language,
        size: file.size,
        content,
        contentHash: createContentHash(content),
      };
    }),
  );
}

function toFileInserts(
  repoId: string,
  files: FetchedAnalysisFile[],
  summaries: Map<string, string>,
): FileInsert[] {
  return files.map((file) => ({
    repo_id: repoId,
    path: file.path,
    language: file.language,
    size_bytes: file.size,
    content_hash: file.contentHash,
    summary: summaries.get(file.path) ?? null,
    role: file.role,
  }));
}

function withStoredFileIds(
  files: FetchedAnalysisFile[],
  storedFiles: FileRow[],
  summaries: Map<string, string>,
): GraphEngineFile[] {
  const storedFilesByPath = new Map(storedFiles.map((file) => [file.path, file]));

  return files.map((file) => ({
    id: storedFilesByPath.get(file.path)?.id,
    path: file.path,
    role: file.role,
    language: file.language,
    content: file.content,
    summary: summaries.get(file.path) ?? null,
  }));
}

function toGraphNodeInserts(repoId: string, nodes: ReactFlowGraphNode[]): GraphNodeInsert[] {
  return nodes.map((node) => ({
    repo_id: repoId,
    file_id: node.data.fileId ?? null,
    label: node.data.label,
    path: node.data.path,
    type: node.type,
    summary: node.data.summary,
    metadata: compactJsonObject({
      reactFlowId: node.id,
      position: {
        x: node.position.x,
        y: node.position.y,
      },
      nodeType: node.data.nodeType,
      role: node.data.role,
      language: node.data.language,
      imports: node.data.imports,
      unresolvedImports: node.data.unresolvedImports,
      routeKind: node.data.routeKind,
    }),
  }));
}

function toGraphEdgeInserts(
  repoId: string,
  edges: ReactFlowGraphEdge[],
  storedNodes: GraphNodeRow[],
): GraphEdgeInsert[] {
  const nodeIdsByReactFlowId = new Map(
    storedNodes
      .map((node) => [reactFlowIdFromNode(node), node.id] as const)
      .filter(([reactFlowId]) => Boolean(reactFlowId)),
  );

  const inserts: GraphEdgeInsert[] = [];

  for (const edge of edges) {
    const sourceNodeId = nodeIdsByReactFlowId.get(edge.source);
    const targetNodeId = nodeIdsByReactFlowId.get(edge.target);
    if (!sourceNodeId || !targetNodeId) {
      continue;
    }

    inserts.push({
      repo_id: repoId,
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      type: edge.label,
      confidence: edge.data.confidence,
      metadata: compactJsonObject({
        reactFlowId: edge.id,
        sourceReactFlowId: edge.source,
        targetReactFlowId: edge.target,
        specifier: edge.data.specifier,
        importedName: edge.data.importedName,
      }),
    });
  }

  return inserts;
}

function toAnalysisOutputInsert(
  repoId: string,
  jobId: string,
  intelligence: AnalysisIntelligenceResult,
): AnalysisOutputInsert {
  return {
    repo_id: repoId,
    analysis_job_id: jobId,
    repo_summary: intelligence.repoSummary,
    architecture_overview: intelligence.architectureOverview,
    learning_path: intelligence.learningPath,
    suggested_tasks: intelligence.suggestedTasks,
    metadata: intelligence.metadata,
  };
}

function compactJsonObject(input: Record<string, Json | undefined>): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, Json] => entry[1] !== undefined),
  );
}

function reactFlowIdFromNode(node: GraphNodeRow): string | null {
  if (typeof node.metadata !== "object" || node.metadata === null || Array.isArray(node.metadata)) {
    return null;
  }

  const metadata = node.metadata as Record<string, unknown>;
  return typeof metadata.reactFlowId === "string" ? metadata.reactFlowId : null;
}
