"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardDescription, CardHeader, CardTitle, ErrorState } from "@/components/ui";
import type { ApiResponse } from "@/lib/api-response";
import type { RepoDashboardData, RepoStatusData } from "@/lib/dashboard-api";

const pollIntervalMs = 2000;

const stages = [
  "Fetching metadata",
  "Reading file tree",
  "Parsing dependencies",
  "Generating summaries",
  "Building graph",
] as const;

type StageState = "pending" | "active" | "complete" | "failed";

export function RepoStatusPanel({ repoId }: { repoId: string }) {
  const [data, setData] = useState<RepoStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function loadStatus() {
      try {
        const payload = await fetchStatus(repoId);

        if (!isMounted) {
          return;
        }

        if (!payload.ok) {
          setError(payload.error.message);
          setData(null);
          return;
        }

        setData(payload.data);
        setError(null);

        if (shouldPoll(payload.data)) {
          timeoutId = setTimeout(loadStatus, pollIntervalMs);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Analysis status could not be loaded.",
          );
          setData(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [repoId]);

  const repoName = data ? `${data.repo.owner}/${data.repo.name}` : `Repository ${repoId}`;
  const status = data?.job?.status ?? null;
  const stageStates = stageStatesFor(data);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Analysis status
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {repoName}
            </h1>
            {data?.repo.description ? (
              <p className="max-w-2xl text-base leading-7 text-slate-600">
                {data.repo.description}
              </p>
            ) : null}
          </div>
          <Link
            className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-100"
            href="/"
          >
            Analyze another repository
          </Link>
        </div>
      </header>

      {error ? <ErrorState title="Status unavailable" message={error} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Analysis stages</CardTitle>
          <CardDescription>{statusDescription({ data, error, isLoading })}</CardDescription>
        </CardHeader>

        <ol className="space-y-3">
          {stages.map((stage, index) => (
            <li
              className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm"
              key={stage}
            >
              <StageMarker state={stageStates[index]} />
              <div>
                <p className="font-medium text-slate-950">{stage}</p>
                <p className="text-xs text-slate-500">{stageStateLabel(stageStates[index])}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {data?.isComplete ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader>
            <CardTitle>Analysis complete.</CardTitle>
            <CardDescription>
              RepoRadar has finished preparing the dashboard, graph, summaries, and starter tasks.
            </CardDescription>
          </CardHeader>
          <Link
            className="inline-flex h-10 w-fit items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            href={`/repos/${repoId}`}
          >
            View dashboard
          </Link>
        </Card>
      ) : null}

      {status === "failed" ? (
        <ErrorState
          title="Analysis failed"
          message={data?.job?.errorMessage ?? "Repository analysis failed before results were saved."}
        />
      ) : null}
    </main>
  );
}

async function fetchStatus(repoId: string): Promise<ApiResponse<RepoStatusData>> {
  const response = await fetch(`/api/repos/${repoId}/status`);

  if (isJsonResponse(response)) {
    return parseJsonResponse<RepoStatusData>(response);
  }

  const dashboardResponse = await fetch(`/api/repos/${repoId}`);
  const dashboardPayload = await parseJsonResponse<RepoDashboardData>(dashboardResponse);

  if (!dashboardPayload.ok) {
    return dashboardPayload;
  }

  return {
    ok: true,
    data: {
      repoId,
      repo: {
        id: dashboardPayload.data.repo.id,
        owner: dashboardPayload.data.repo.owner,
        name: dashboardPayload.data.repo.name,
        url: dashboardPayload.data.repo.url,
        description: dashboardPayload.data.repo.description,
      },
      job: dashboardPayload.data.job,
      isComplete: dashboardPayload.data.job?.status === "completed" && Boolean(dashboardPayload.data.summary),
      hasOutput: Boolean(dashboardPayload.data.summary),
    },
  };
}

async function parseJsonResponse<TData>(response: Response): Promise<ApiResponse<TData>> {
  try {
    return JSON.parse(await response.text()) as ApiResponse<TData>;
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid_response",
        message: "Analysis status could not be loaded.",
      },
    };
  }
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("application/json") ?? false;
}

function shouldPoll(data: RepoStatusData): boolean {
  return data.job?.status === "queued" || data.job?.status === "running";
}

function statusDescription({
  data,
  error,
  isLoading,
}: {
  data: RepoStatusData | null;
  error: string | null;
  isLoading: boolean;
}): string {
  if (isLoading) {
    return "Loading analysis status...";
  }

  if (error) {
    return "RepoRadar could not load the latest analysis state.";
  }

  if (!data?.job) {
    return "Analysis has not started yet.";
  }

  if (data.job.status === "queued") {
    return "RepoRadar is waiting to start this repository analysis.";
  }

  if (data.job.status === "running") {
    return "RepoRadar is analyzing this repository now.";
  }

  if (data.job.status === "completed" && data.hasOutput) {
    return "All analysis stages are finished.";
  }

  if (data.job.status === "completed") {
    return "Analysis completed, but dashboard output is still finalizing.";
  }

  return "RepoRadar stopped before analysis completed.";
}

function stageStatesFor(data: RepoStatusData | null): StageState[] {
  const status = data?.job?.status;

  if (data && status === "completed" && data.hasOutput) {
    return stages.map(() => "complete");
  }

  if (status === "failed") {
    return stages.map((_, index) => (index === 0 ? "failed" : "pending"));
  }

  if (status === "running") {
    return stages.map((_, index) => (index === 0 ? "active" : "pending"));
  }

  return stages.map(() => "pending");
}

function StageMarker({ state }: { state: StageState }) {
  const classes: Record<StageState, string> = {
    active: "border-slate-950 bg-slate-950 text-white",
    complete: "border-emerald-600 bg-emerald-600 text-white",
    failed: "border-red-600 bg-red-600 text-white",
    pending: "border-slate-300 bg-white text-slate-500",
  };
  const labels: Record<StageState, string> = {
    active: "In progress",
    complete: "Complete",
    failed: "Failed",
    pending: "Pending",
  };

  return (
    <span
      aria-label={labels[state]}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${classes[state]}`}
    >
      {symbolForState(state)}
    </span>
  );
}

function symbolForState(state: StageState): string {
  if (state === "complete") {
    return "OK";
  }

  if (state === "failed") {
    return "!";
  }

  if (state === "active") {
    return "...";
  }

  return "";
}

function stageStateLabel(state: StageState): string {
  const labels: Record<StageState, string> = {
    active: "In progress",
    complete: "Complete",
    failed: "Failed",
    pending: "Pending",
  };

  return labels[state];
}
