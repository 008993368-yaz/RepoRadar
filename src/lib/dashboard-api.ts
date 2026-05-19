import type {
  AnalysisJobRow,
  AnalysisOutputRow,
  FileRow,
  GraphEdgeRow,
  GraphNodeRow,
  Json,
  RepoRow,
} from "./repo-database";

export type DashboardApiError = {
  code: "analysis_failed" | "analysis_incomplete";
  message: string;
  details: {
    repoId: string;
    jobId: string | null;
    status: AnalysisJobRow["status"] | null;
  };
};

export type RepoDashboardData = {
  repo: {
    id: string;
    owner: string;
    name: string;
    url: string;
    description: string | null;
    defaultBranch: string | null;
    primaryLanguage: string | null;
    stars: number | null;
    forks: number | null;
    license: string | null;
  };
  summary: string | null;
  architectureOverview: string | null;
  learningPath: string[];
  techStack: string[];
  importantFiles: Array<{
    id: string;
    path: string;
    role: string | null;
    language: string | null;
    sizeBytes: number | null;
    summary: string | null;
  }>;
  suggestedTasks: SuggestedTask[];
  job: DashboardJob | null;
};

export type RepoGraphData = {
  nodes: ReactFlowDashboardNode[];
  edges: ReactFlowDashboardEdge[];
};

export type RepoStatusData = {
  repoId: string;
  job: DashboardJob | null;
  isComplete: boolean;
  hasOutput: boolean;
};

type DashboardJob = {
  id: string;
  status: AnalysisJobRow["status"];
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

type SuggestedTask = {
  title: string;
  reason: string;
  paths: string[];
};

type ReactFlowDashboardNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: {
    x: number;
    y: number;
  };
};

type ReactFlowDashboardEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  data: Record<string, unknown>;
};

export function mapDashboardData(input: {
  repo: RepoRow;
  job: AnalysisJobRow | null;
  output: AnalysisOutputRow | null;
  files: FileRow[];
}): RepoDashboardData {
  return {
    repo: {
      id: input.repo.id,
      owner: input.repo.owner,
      name: input.repo.name,
      url: input.repo.url,
      description: input.repo.description,
      defaultBranch: input.repo.default_branch,
      primaryLanguage: input.repo.primary_language,
      stars: input.repo.stars,
      forks: input.repo.forks,
      license: input.repo.license,
    },
    summary: input.output?.repo_summary ?? null,
    architectureOverview: input.output?.architecture_overview ?? null,
    learningPath: stringArray(input.output?.learning_path),
    techStack: deriveTechStack(input.repo, input.files),
    importantFiles: input.files.map((file) => ({
      id: file.id,
      path: file.path,
      role: file.role,
      language: file.language,
      sizeBytes: file.size_bytes,
      summary: file.summary,
    })),
    suggestedTasks: suggestedTasks(input.output?.suggested_tasks),
    job: input.job ? mapJob(input.job) : null,
  };
}

export function mapStatusData(input: {
  repoId: string;
  job: AnalysisJobRow | null;
  output: AnalysisOutputRow | null;
}): RepoStatusData {
  return {
    repoId: input.repoId,
    job: input.job ? mapJob(input.job) : null,
    isComplete: input.job?.status === "completed" && Boolean(input.output),
    hasOutput: Boolean(input.output),
  };
}

export function mapGraphData(nodes: GraphNodeRow[], edges: GraphEdgeRow[]): RepoGraphData {
  const reactFlowIdsByStoredId = new Map<string, string>();
  const mappedNodes = nodes.map((node) => {
    const metadata = objectRecord(node.metadata);
    const reactFlowId = stringValue(metadata.reactFlowId) ?? node.id;
    reactFlowIdsByStoredId.set(node.id, reactFlowId);

    const data = compactRecord({
      label: node.label,
      path: node.path,
      summary: node.summary,
      nodeType: stringValue(metadata.nodeType) ?? node.type,
      fileId: node.file_id,
      role: stringValue(metadata.role),
      language: metadata.language === null ? null : stringValue(metadata.language),
      imports: stringArray(metadata.imports),
      unresolvedImports: stringArray(metadata.unresolvedImports),
      routeKind: stringValue(metadata.routeKind),
    });

    return {
      id: reactFlowId,
      type: node.type,
      data,
      position: positionValue(metadata.position),
    };
  });

  const mappedEdges = edges
    .map((edge) => {
      const source = reactFlowIdsByStoredId.get(edge.source_node_id);
      const target = reactFlowIdsByStoredId.get(edge.target_node_id);
      if (!source || !target) {
        return null;
      }

      const metadata = objectRecord(edge.metadata);

      return {
        id: stringValue(metadata.reactFlowId) ?? edge.id,
        source,
        target,
        label: edge.type,
        data: compactRecord({
          edgeType: edge.type,
          confidence: edge.confidence,
          specifier: stringValue(metadata.specifier),
          importedName: stringValue(metadata.importedName),
        }),
      };
    })
    .filter((edge): edge is ReactFlowDashboardEdge => edge !== null);

  return {
    nodes: mappedNodes,
    edges: mappedEdges,
  };
}

export function createAnalysisFailedError(job: AnalysisJobRow): DashboardApiError {
  return {
    code: "analysis_failed",
    message: "Repository analysis failed.",
    details: {
      repoId: job.repo_id,
      jobId: job.id,
      status: job.status,
    },
  };
}

export function createAnalysisIncompleteError(
  repoId: string,
  job: AnalysisJobRow | null,
): DashboardApiError {
  return {
    code: "analysis_incomplete",
    message: "Repository analysis is not ready yet.",
    details: {
      repoId,
      jobId: job?.id ?? null,
      status: job?.status ?? null,
    },
  };
}

function mapJob(job: AnalysisJobRow): DashboardJob {
  return {
    id: job.id,
    status: job.status,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  };
}

function deriveTechStack(repo: RepoRow, files: FileRow[]): string[] {
  const stack: string[] = [];
  addUnique(stack, repo.primary_language);

  for (const file of files) {
    addUnique(stack, file.language);
  }

  for (const file of files) {
    const path = normalizePath(file.path);
    if (/^next\.config\.[cm]?[jt]s$/.test(path)) {
      addUnique(stack, "Next.js");
    }
    if (/^tailwind\.config\.[cm]?[jt]s$/.test(path)) {
      addUnique(stack, "Tailwind CSS");
    }
    if (/^postcss\.config\.[cm]?js$/.test(path)) {
      addUnique(stack, "PostCSS");
    }
    if (path === "package.json") {
      addUnique(stack, "Node.js");
    }
    if (path.startsWith("supabase/")) {
      addUnique(stack, "Supabase");
    }
    if (path === "schema.prisma") {
      addUnique(stack, "Prisma");
    }
    if (/^vite\.config\.[cm]?[jt]s$/.test(path)) {
      addUnique(stack, "Vite");
    }
  }

  return stack;
}

function suggestedTasks(value: Json | undefined): SuggestedTask[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isSuggestedTask);
}

function isSuggestedTask(value: Json): value is SuggestedTask {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, Json>;
  return (
    typeof record.title === "string" &&
    typeof record.reason === "string" &&
    Array.isArray(record.paths) &&
    record.paths.every((path) => typeof path === "string")
  );
}

function stringArray(value: Json | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function objectRecord(value: Json): Record<string, Json> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value;
}

function stringValue(value: Json | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function positionValue(value: Json | undefined): { x: number; y: number } {
  const record = objectRecord(value ?? null);
  return typeof record.x === "number" && typeof record.y === "number"
    ? { x: record.x, y: record.y }
    : { x: 0, y: 0 };
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return value !== undefined;
    }),
  );
}

function addUnique(values: string[], value: string | null | undefined) {
  if (value && !values.includes(value)) {
    values.push(value);
  }
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}
