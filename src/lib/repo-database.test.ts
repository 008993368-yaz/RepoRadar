import { describe, expect, it } from "vitest";

import {
  AppDatabaseError,
  createAnalysisJob,
  createRepoDatabase,
  deleteGraphEdges,
  findLatestAnalysisOutput,
  findLatestCompletedAnalysisJob,
  findRepositoryByOwnerName,
  getRepoDatabase,
  insertAnalysisOutput,
  insertChatMessage,
  insertGraphEdges,
  listGraphNodes,
  listRepoFiles,
  updateAnalysisJob,
  upsertFiles,
  upsertGraphNodes,
  upsertRepository,
} from "./repo-database";

type QueryResult = {
  data?: unknown;
  error?: { message: string };
};

class FakeQueryBuilder {
  calls: Array<{ method: string; payload?: unknown; options?: unknown }> = [];

  constructor(private readonly result: QueryResult) {}

  delete() {
    this.calls.push({ method: "delete" });
    return this;
  }

  insert(payload: unknown) {
    this.calls.push({ method: "insert", payload });
    return this;
  }

  update(payload: unknown) {
    this.calls.push({ method: "update", payload });
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.calls.push({ method: "upsert", payload, options });
    return this;
  }

  eq(column: string, value: unknown) {
    this.calls.push({ method: "eq", payload: { column, value } });
    return this;
  }

  limit(payload: number) {
    this.calls.push({ method: "limit", payload });
    return this;
  }

  order(payload: string, options?: unknown) {
    this.calls.push({ method: "order", payload, options });
    return this;
  }

  select(payload?: unknown) {
    this.calls.push({ method: "select", payload });
    return this;
  }

  maybeSingle() {
    this.calls.push({ method: "maybeSingle" });
    return Promise.resolve(this.result);
  }

  single() {
    this.calls.push({ method: "single" });
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

class FakeSupabaseClient {
  builders: Record<string, FakeQueryBuilder>;
  selectedTables: string[] = [];

  constructor(results: Record<string, QueryResult>) {
    this.builders = Object.fromEntries(
      Object.entries(results).map(([table, result]) => [table, new FakeQueryBuilder(result)]),
    );
  }

  from(table: string) {
    this.selectedTables.push(table);
    return this.builders[table];
  }
}

describe("repo database helpers", () => {
  it("finds repositories by owner and name for cache checks", async () => {
    const client = new FakeSupabaseClient({
      repos: {
        data: {
          id: "repo-uuid",
          owner: "vercel",
          name: "next.js",
          url: "https://github.com/vercel/next.js",
        },
      },
    });
    const database = createRepoDatabase(client);

    const repo = await findRepositoryByOwnerName(database, "vercel", "next.js");

    expect(repo?.id).toBe("repo-uuid");
    expect(client.builders.repos.calls).toEqual([
      { method: "select", payload: "*" },
      { method: "eq", payload: { column: "owner", value: "vercel" } },
      { method: "eq", payload: { column: "name", value: "next.js" } },
      { method: "maybeSingle" },
    ]);
  });

  it("returns null when a cache lookup has no repository row", async () => {
    const client = new FakeSupabaseClient({
      repos: {
        data: null,
      },
    });
    const database = createRepoDatabase(client);

    await expect(findRepositoryByOwnerName(database, "vercel", "next.js")).resolves.toBeNull();
  });

  it("upserts repositories by owner and name", async () => {
    const client = new FakeSupabaseClient({
      repos: {
        data: {
          id: "repo-uuid",
          owner: "vercel",
          name: "next.js",
          url: "https://github.com/vercel/next.js",
        },
      },
    });
    const database = createRepoDatabase(client);

    const repo = await upsertRepository(database, {
      owner: "vercel",
      name: "next.js",
      url: "https://github.com/vercel/next.js",
    });

    expect(repo.id).toBe("repo-uuid");
    expect(client.selectedTables).toEqual(["repos"]);
    expect(client.builders.repos.calls).toEqual([
      {
        method: "upsert",
        payload: {
          owner: "vercel",
          name: "next.js",
          url: "https://github.com/vercel/next.js",
        },
        options: { onConflict: "owner,name" },
      },
      { method: "select", payload: "*" },
      { method: "single" },
    ]);
  });

  it("creates queued analysis jobs for repositories", async () => {
    const client = new FakeSupabaseClient({
      analysis_jobs: {
        data: {
          id: "job-uuid",
          repo_id: "repo-uuid",
          status: "queued",
          error_message: null,
          completed_at: null,
        },
      },
    });
    const database = createRepoDatabase(client);

    const job = await createAnalysisJob(database, "repo-uuid");

    expect(job).toMatchObject({
      id: "job-uuid",
      repo_id: "repo-uuid",
      status: "queued",
    });
    expect(client.builders.analysis_jobs.calls).toEqual([
      { method: "insert", payload: { repo_id: "repo-uuid", status: "queued" } },
      { method: "select", payload: "*" },
      { method: "single" },
    ]);
  });

  it("finds the latest completed analysis job for a repository", async () => {
    const client = new FakeSupabaseClient({
      analysis_jobs: {
        data: {
          id: "job-uuid",
          repo_id: "repo-uuid",
          status: "completed",
          error_message: null,
          completed_at: "2026-05-18T20:01:00.000Z",
        },
      },
    });
    const database = createRepoDatabase(client);

    const job = await findLatestCompletedAnalysisJob(database, "repo-uuid");

    expect(job?.id).toBe("job-uuid");
    expect(client.builders.analysis_jobs.calls).toEqual([
      { method: "select", payload: "*" },
      { method: "eq", payload: { column: "repo_id", value: "repo-uuid" } },
      { method: "eq", payload: { column: "status", value: "completed" } },
      { method: "order", payload: "created_at", options: { ascending: false } },
      { method: "limit", payload: 1 },
      { method: "maybeSingle" },
    ]);
  });

  it("updates analysis job status fields", async () => {
    const client = new FakeSupabaseClient({
      analysis_jobs: {
        data: {
          id: "job-uuid",
          repo_id: "repo-uuid",
          status: "failed",
          error_message: "GitHub rate limit reached",
          completed_at: "2026-05-18T20:00:00.000Z",
        },
      },
    });
    const database = createRepoDatabase(client);

    await updateAnalysisJob(database, "job-uuid", {
      status: "failed",
      error_message: "GitHub rate limit reached",
      completed_at: "2026-05-18T20:00:00.000Z",
    });

    expect(client.builders.analysis_jobs.calls).toEqual([
      {
        method: "update",
        payload: {
          status: "failed",
          error_message: "GitHub rate limit reached",
          completed_at: "2026-05-18T20:00:00.000Z",
        },
      },
      { method: "eq", payload: { column: "id", value: "job-uuid" } },
      { method: "select", payload: "*" },
      { method: "single" },
    ]);
  });

  it("lists repository files for cache checks", async () => {
    const client = new FakeSupabaseClient({
      files: {
        data: [{ id: "file-uuid", repo_id: "repo-uuid", path: "app/page.tsx" }],
      },
    });
    const database = createRepoDatabase(client);

    await expect(listRepoFiles(database, "repo-uuid")).resolves.toEqual([
      { id: "file-uuid", repo_id: "repo-uuid", path: "app/page.tsx" },
    ]);
    expect(client.builders.files.calls).toEqual([
      { method: "select", payload: "*" },
      { method: "eq", payload: { column: "repo_id", value: "repo-uuid" } },
    ]);
  });

  it("upserts selected files by repo and path", async () => {
    const client = new FakeSupabaseClient({
      files: {
        data: [{ id: "file-uuid", repo_id: "repo-uuid", path: "app/page.tsx" }],
      },
    });
    const database = createRepoDatabase(client);

    const files = await upsertFiles(database, [
      {
        repo_id: "repo-uuid",
        path: "app/page.tsx",
        language: "TypeScript",
        size_bytes: 1200,
        content_hash: "hash",
        role: "component",
      },
    ]);

    expect(files).toEqual([{ id: "file-uuid", repo_id: "repo-uuid", path: "app/page.tsx" }]);
    expect(client.builders.files.calls).toEqual([
      {
        method: "upsert",
        payload: [
          {
            repo_id: "repo-uuid",
            path: "app/page.tsx",
            language: "TypeScript",
            size_bytes: 1200,
            content_hash: "hash",
            role: "component",
          },
        ],
        options: { onConflict: "repo_id,path" },
      },
      { method: "select", payload: "*" },
    ]);
  });

  it("lists graph nodes for cache checks", async () => {
    const client = new FakeSupabaseClient({
      graph_nodes: {
        data: [{ id: "node-uuid", repo_id: "repo-uuid", path: "app/page.tsx" }],
      },
    });
    const database = createRepoDatabase(client);

    await expect(listGraphNodes(database, "repo-uuid")).resolves.toEqual([
      { id: "node-uuid", repo_id: "repo-uuid", path: "app/page.tsx" },
    ]);
    expect(client.builders.graph_nodes.calls).toEqual([
      { method: "select", payload: "*" },
      { method: "eq", payload: { column: "repo_id", value: "repo-uuid" } },
    ]);
  });

  it("upserts graph nodes by repo and path", async () => {
    const client = new FakeSupabaseClient({
      graph_nodes: {
        data: [{ id: "node-uuid", repo_id: "repo-uuid", path: "app/page.tsx" }],
      },
    });
    const database = createRepoDatabase(client);

    await upsertGraphNodes(database, [
      {
        repo_id: "repo-uuid",
        file_id: "file-uuid",
        label: "app/page.tsx",
        path: "app/page.tsx",
        type: "component",
        metadata: { imports: 2 },
      },
    ]);

    expect(client.builders.graph_nodes.calls).toEqual([
      {
        method: "upsert",
        payload: [
          {
            repo_id: "repo-uuid",
            file_id: "file-uuid",
            label: "app/page.tsx",
            path: "app/page.tsx",
            type: "component",
            metadata: { imports: 2 },
          },
        ],
        options: { onConflict: "repo_id,path" },
      },
      { method: "select", payload: "*" },
    ]);
  });

  it("deletes existing graph edges before inserting a rebuilt graph", async () => {
    const client = new FakeSupabaseClient({
      graph_edges: {
        data: null,
      },
    });
    const database = createRepoDatabase(client);

    await deleteGraphEdges(database, "repo-uuid");

    expect(client.builders.graph_edges.calls).toEqual([
      { method: "delete" },
      { method: "eq", payload: { column: "repo_id", value: "repo-uuid" } },
    ]);
  });

  it("inserts graph edges", async () => {
    const client = new FakeSupabaseClient({
      graph_edges: {
        data: [{ id: "edge-uuid", repo_id: "repo-uuid", type: "imports" }],
      },
    });
    const database = createRepoDatabase(client);

    await insertGraphEdges(database, [
      {
        repo_id: "repo-uuid",
        source_node_id: "source-node",
        target_node_id: "target-node",
        type: "imports",
        confidence: 0.9,
      },
    ]);

    expect(client.builders.graph_edges.calls).toEqual([
      {
        method: "insert",
        payload: [
          {
            repo_id: "repo-uuid",
            source_node_id: "source-node",
            target_node_id: "target-node",
            type: "imports",
            confidence: 0.9,
          },
        ],
      },
      { method: "select", payload: "*" },
    ]);
  });

  it("inserts chat messages", async () => {
    const client = new FakeSupabaseClient({
      chat_messages: {
        data: {
          id: "message-uuid",
          repo_id: "repo-uuid",
          role: "user",
          content: "What should I read first?",
        },
      },
    });
    const database = createRepoDatabase(client);

    await insertChatMessage(database, {
      repo_id: "repo-uuid",
      role: "user",
      content: "What should I read first?",
      citations: [],
    });

    expect(client.builders.chat_messages.calls).toEqual([
      {
        method: "insert",
        payload: {
          repo_id: "repo-uuid",
          role: "user",
          content: "What should I read first?",
          citations: [],
        },
      },
      { method: "select", payload: "*" },
      { method: "single" },
    ]);
  });

  it("inserts repo-level analysis outputs", async () => {
    const client = new FakeSupabaseClient({
      analysis_outputs: {
        data: {
          id: "output-uuid",
          repo_id: "repo-uuid",
          analysis_job_id: "job-uuid",
          repo_summary: "Repo summary",
          architecture_overview: "Architecture overview",
          learning_path: ["Read README.md"],
          suggested_tasks: [],
          metadata: { provider: "fallback" },
        },
      },
    });
    const database = createRepoDatabase(client);

    await insertAnalysisOutput(database, {
      repo_id: "repo-uuid",
      analysis_job_id: "job-uuid",
      repo_summary: "Repo summary",
      architecture_overview: "Architecture overview",
      learning_path: ["Read README.md"],
      suggested_tasks: [],
      metadata: { provider: "fallback" },
    });

    expect(client.builders.analysis_outputs.calls).toEqual([
      {
        method: "insert",
        payload: {
          repo_id: "repo-uuid",
          analysis_job_id: "job-uuid",
          repo_summary: "Repo summary",
          architecture_overview: "Architecture overview",
          learning_path: ["Read README.md"],
          suggested_tasks: [],
          metadata: { provider: "fallback" },
        },
      },
      { method: "select", payload: "*" },
      { method: "single" },
    ]);
  });

  it("finds the latest repo-level analysis output for dashboard APIs", async () => {
    const client = new FakeSupabaseClient({
      analysis_outputs: {
        data: {
          id: "output-uuid",
          repo_id: "repo-uuid",
          analysis_job_id: "job-uuid",
          repo_summary: "Repo summary",
          architecture_overview: "Architecture overview",
          learning_path: ["Read README.md"],
          suggested_tasks: [],
          metadata: {},
        },
      },
    });
    const database = createRepoDatabase(client);

    await expect(findLatestAnalysisOutput(database, "repo-uuid")).resolves.toMatchObject({
      id: "output-uuid",
      repo_summary: "Repo summary",
    });
    expect(client.builders.analysis_outputs.calls).toEqual([
      { method: "select", payload: "*" },
      { method: "eq", payload: { column: "repo_id", value: "repo-uuid" } },
      { method: "order", payload: "created_at", options: { ascending: false } },
      { method: "limit", payload: 1 },
      { method: "maybeSingle" },
    ]);
  });

  it("normalizes Supabase failures into app database errors", async () => {
    const client = new FakeSupabaseClient({
      repos: {
        error: { message: "duplicate key value violates unique constraint" },
      },
    });
    const database = createRepoDatabase(client);

    await expect(
      upsertRepository(database, {
        owner: "vercel",
        name: "next.js",
        url: "https://github.com/vercel/next.js",
      }),
    ).rejects.toMatchObject({
      code: "database_error",
      message: "Unable to persist repository analysis data.",
    } satisfies Partial<AppDatabaseError>);
  });

  it("throws a configuration error when Supabase environment variables are missing", () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      expect(() => getRepoDatabase()).toThrow(
        new AppDatabaseError(
          "configuration_error",
          "Supabase environment variables are not configured.",
        ),
      );
    } finally {
      process.env.SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    }
  });
});
