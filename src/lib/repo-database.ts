import { createClient } from "@supabase/supabase-js";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type AnalysisJobStatus = "queued" | "running" | "completed" | "failed";
export type ChatMessageRole = "user" | "assistant";

export type RepoRow = {
  id: string;
  owner: string;
  name: string;
  url: string;
  description: string | null;
  default_branch: string | null;
  primary_language: string | null;
  stars: number | null;
  forks: number | null;
  license: string | null;
  readme: string | null;
  created_at: string;
  updated_at: string;
};

export type RepoInsert = {
  owner: string;
  name: string;
  url: string;
  description?: string | null;
  default_branch?: string | null;
  primary_language?: string | null;
  stars?: number | null;
  forks?: number | null;
  license?: string | null;
  readme?: string | null;
};

export type AnalysisJobRow = {
  id: string;
  repo_id: string;
  status: AnalysisJobStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type FileRow = {
  id: string;
  repo_id: string;
  path: string;
  language: string | null;
  size_bytes: number | null;
  content_hash: string | null;
  summary: string | null;
  role: string | null;
  created_at: string;
};

export type FileInsert = {
  repo_id: string;
  path: string;
  language?: string | null;
  size_bytes?: number | null;
  content_hash?: string | null;
  summary?: string | null;
  role?: string | null;
};

export type GraphNodeRow = {
  id: string;
  repo_id: string;
  file_id: string | null;
  label: string;
  path: string;
  type: string;
  summary: string | null;
  metadata: Json;
};

export type GraphNodeInsert = {
  repo_id: string;
  file_id?: string | null;
  label: string;
  path: string;
  type: string;
  summary?: string | null;
  metadata?: Json;
};

export type GraphEdgeRow = {
  id: string;
  repo_id: string;
  source_node_id: string;
  target_node_id: string;
  type: string;
  confidence: number | null;
  metadata: Json;
};

export type GraphEdgeInsert = {
  repo_id: string;
  source_node_id: string;
  target_node_id: string;
  type: string;
  confidence?: number | null;
  metadata?: Json;
};

export type ChatMessageRow = {
  id: string;
  repo_id: string;
  role: ChatMessageRole;
  content: string;
  citations: Json;
  created_at: string;
};

export type ChatMessageInsert = {
  repo_id: string;
  role: ChatMessageRole;
  content: string;
  citations?: Json;
};

export type AnalysisOutputRow = {
  id: string;
  repo_id: string;
  analysis_job_id: string;
  repo_summary: string;
  architecture_overview: string;
  learning_path: Json;
  suggested_tasks: Json;
  metadata: Json;
  created_at: string;
};

export type AnalysisOutputInsert = {
  repo_id: string;
  analysis_job_id: string;
  repo_summary: string;
  architecture_overview: string;
  learning_path?: Json;
  suggested_tasks?: Json;
  metadata?: Json;
};

type SupabaseQueryResult<TData> = PromiseLike<{
  data?: TData | null;
  error?: { message: string } | null;
}>;

type SupabaseQueryBuilder<TData> = {
  delete(): SupabaseQueryBuilder<TData>;
  insert(payload: unknown): SupabaseQueryBuilder<TData>;
  upsert(payload: unknown, options?: unknown): SupabaseQueryBuilder<TData>;
  update(payload: unknown): SupabaseQueryBuilder<TData>;
  eq(column: string, value: unknown): SupabaseQueryBuilder<TData>;
  limit(count: number): SupabaseQueryBuilder<TData>;
  order(column: string, options?: unknown): SupabaseQueryBuilder<TData>;
  select(columns?: string): SupabaseQueryBuilder<TData>;
  maybeSingle(): SupabaseQueryResult<TData>;
  single(): SupabaseQueryResult<TData>;
} & PromiseLike<{
  data?: TData | null;
  error?: { message: string } | null;
}>;

type SupabaseLikeClient = {
  from<TData = unknown>(table: string): SupabaseQueryBuilder<TData>;
};

export type RepoDatabase = {
  client: SupabaseLikeClient;
};

export class AppDatabaseError extends Error {
  constructor(
    public readonly code: "configuration_error" | "database_error",
    message: string,
  ) {
    super(message);
    this.name = "AppDatabaseError";
  }
}

export function createRepoDatabase(client: SupabaseLikeClient): RepoDatabase {
  return { client };
}

export function getRepoDatabase(): RepoDatabase {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AppDatabaseError(
      "configuration_error",
      "Supabase environment variables are not configured.",
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  }) as unknown as SupabaseLikeClient;

  return createRepoDatabase(client);
}

export async function upsertRepository(
  database: RepoDatabase,
  repository: RepoInsert,
): Promise<RepoRow> {
  return executeSingle<RepoRow>(
    database.client
      .from<RepoRow>("repos")
      .upsert(repository, { onConflict: "owner,name" })
      .select("*")
      .single(),
  );
}

export async function findRepositoryByOwnerName(
  database: RepoDatabase,
  owner: string,
  name: string,
): Promise<RepoRow | null> {
  return executeMaybeSingle<RepoRow>(
    database.client
      .from<RepoRow>("repos")
      .select("*")
      .eq("owner", owner)
      .eq("name", name)
      .maybeSingle(),
  );
}

export async function createAnalysisJob(
  database: RepoDatabase,
  repoId: string,
): Promise<AnalysisJobRow> {
  return executeSingle<AnalysisJobRow>(
    database.client
      .from<AnalysisJobRow>("analysis_jobs")
      .insert({ repo_id: repoId, status: "queued" })
      .select("*")
      .single(),
  );
}

export async function findLatestCompletedAnalysisJob(
  database: RepoDatabase,
  repoId: string,
): Promise<AnalysisJobRow | null> {
  return executeMaybeSingle<AnalysisJobRow>(
    database.client
      .from<AnalysisJobRow>("analysis_jobs")
      .select("*")
      .eq("repo_id", repoId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}

export async function updateAnalysisJob(
  database: RepoDatabase,
  jobId: string,
  update: {
    status: AnalysisJobStatus;
    error_message?: string | null;
    completed_at?: string | null;
  },
): Promise<AnalysisJobRow> {
  return executeSingle<AnalysisJobRow>(
    database.client
      .from<AnalysisJobRow>("analysis_jobs")
      .update(update)
      .eq("id", jobId)
      .select("*")
      .single(),
  );
}

export async function listRepoFiles(database: RepoDatabase, repoId: string): Promise<FileRow[]> {
  return executeList<FileRow>(
    database.client.from<FileRow[]>("files").select("*").eq("repo_id", repoId),
  );
}

export async function upsertFiles(
  database: RepoDatabase,
  files: FileInsert[],
): Promise<FileRow[]> {
  return executeList<FileRow>(
    database.client
      .from<FileRow[]>("files")
      .upsert(files, { onConflict: "repo_id,path" })
      .select("*"),
  );
}

export async function listGraphNodes(
  database: RepoDatabase,
  repoId: string,
): Promise<GraphNodeRow[]> {
  return executeList<GraphNodeRow>(
    database.client.from<GraphNodeRow[]>("graph_nodes").select("*").eq("repo_id", repoId),
  );
}

export async function upsertGraphNodes(
  database: RepoDatabase,
  nodes: GraphNodeInsert[],
): Promise<GraphNodeRow[]> {
  return executeList<GraphNodeRow>(
    database.client
      .from<GraphNodeRow[]>("graph_nodes")
      .upsert(nodes, { onConflict: "repo_id,path" })
      .select("*"),
  );
}

export async function deleteGraphEdges(database: RepoDatabase, repoId: string): Promise<void> {
  await executeMutation(
    database.client.from("graph_edges").delete().eq("repo_id", repoId),
  );
}

export async function insertGraphEdges(
  database: RepoDatabase,
  edges: GraphEdgeInsert[],
): Promise<GraphEdgeRow[]> {
  return executeList<GraphEdgeRow>(
    database.client.from<GraphEdgeRow[]>("graph_edges").insert(edges).select("*"),
  );
}

export async function insertChatMessage(
  database: RepoDatabase,
  message: ChatMessageInsert,
): Promise<ChatMessageRow> {
  return executeSingle<ChatMessageRow>(
    database.client.from<ChatMessageRow>("chat_messages").insert(message).select("*").single(),
  );
}

export async function insertAnalysisOutput(
  database: RepoDatabase,
  output: AnalysisOutputInsert,
): Promise<AnalysisOutputRow> {
  return executeSingle<AnalysisOutputRow>(
    database.client.from<AnalysisOutputRow>("analysis_outputs").insert(output).select("*").single(),
  );
}

export async function findLatestAnalysisOutput(
  database: RepoDatabase,
  repoId: string,
): Promise<AnalysisOutputRow | null> {
  return executeMaybeSingle<AnalysisOutputRow>(
    database.client
      .from<AnalysisOutputRow>("analysis_outputs")
      .select("*")
      .eq("repo_id", repoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}

async function executeSingle<TRow>(query: SupabaseQueryResult<TRow>): Promise<TRow> {
  const { data, error } = await query;

  if (error || !data) {
    throw new AppDatabaseError("database_error", "Unable to persist repository analysis data.");
  }

  return data;
}

async function executeMaybeSingle<TRow>(
  query: SupabaseQueryResult<TRow>,
): Promise<TRow | null> {
  const { data, error } = await query;

  if (error) {
    throw new AppDatabaseError("database_error", "Unable to persist repository analysis data.");
  }

  return data ?? null;
}

async function executeList<TRow>(query: SupabaseQueryResult<TRow[]>): Promise<TRow[]> {
  const { data, error } = await query;

  if (error || !data) {
    throw new AppDatabaseError("database_error", "Unable to persist repository analysis data.");
  }

  return data;
}

async function executeMutation(query: SupabaseQueryResult<unknown>): Promise<void> {
  const { error } = await query;

  if (error) {
    throw new AppDatabaseError("database_error", "Unable to persist repository analysis data.");
  }
}
