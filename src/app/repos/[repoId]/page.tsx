import Link from "next/link";
import { notFound } from "next/navigation";

import { RepoGraphPanel } from "@/components/graph/repo-graph-panel";
import { RepoChatPanel } from "@/components/repo-chat-panel";
import { Card, CardDescription, CardHeader, CardTitle, ErrorState } from "@/components/ui";
import { mapDashboardData, type RepoDashboardData } from "@/lib/dashboard-api";
import {
  AppDatabaseError,
  type AnalysisJobStatus,
  findLatestAnalysisJob,
  findLatestAnalysisOutput,
  findRepositoryById,
  getRepoDatabase,
  listRepoFiles,
} from "@/lib/repo-database";

type RepoDashboardPageProps = {
  params: Promise<{ repoId: string }>;
};

export default async function RepoDashboardPage({ params }: RepoDashboardPageProps) {
  const { repoId } = await params;
  let data: RepoDashboardData | null;

  try {
    data = await loadDashboardData(repoId);
  } catch (error) {
    if (error instanceof AppDatabaseError) {
      return (
        <DashboardShell eyebrow="Dashboard" title="Repository dashboard">
          <ErrorState title="Dashboard unavailable" message={error.message} />
        </DashboardShell>
      );
    }

    throw error;
  }

  if (!data) {
    notFound();
  }

  return <Dashboard data={data} />;
}

async function loadDashboardData(repoId: string): Promise<RepoDashboardData | null> {
  const database = getRepoDatabase();
  const repo = await findRepositoryById(database, repoId);

  if (!repo) {
    return null;
  }

  const job = await findLatestAnalysisJob(database, repoId);

  if (job?.status === "failed") {
    return mapDashboardData({ repo, job, output: null, files: [] });
  }

  const [output, files] = await Promise.all([
    findLatestAnalysisOutput(database, repoId),
    listRepoFiles(database, repoId),
  ]);

  return mapDashboardData({ repo, job, output, files });
}

function Dashboard({ data }: { data: RepoDashboardData }) {
  const repoName = `${data.repo.owner}/${data.repo.name}`;

  if (data.job?.status === "failed") {
    return (
      <DashboardShell eyebrow="Dashboard" title={repoName} description={data.repo.description}>
        <ErrorState
          title="Analysis failed"
          message={data.job.errorMessage ?? "Repository analysis failed before results were saved."}
        />
      </DashboardShell>
    );
  }

  if (data.job?.status !== "completed" || !data.summary || !data.architectureOverview) {
    return (
      <DashboardShell eyebrow="Dashboard" title={repoName} description={data.repo.description}>
        <Card>
          <CardHeader>
            <CardTitle>Analysis is still running.</CardTitle>
            <CardDescription>
              RepoRadar is preparing summaries, file context, and beginner tasks for this
              repository.
            </CardDescription>
          </CardHeader>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            href={`/repos/${data.repo.id}/status`}
          >
            View analysis status
          </Link>
        </Card>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell eyebrow="Repository dashboard" title={repoName} description={data.repo.description}>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Stars" value={formatNumber(data.repo.stars)} />
        <Metric label="Forks" value={formatNumber(data.repo.forks)} />
        <Metric label="Language" value={data.repo.primaryLanguage ?? "Unknown"} />
        <Metric label="License" value={data.repo.license ?? "Not detected"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Repository summary</CardTitle>
            <CardDescription>{data.summary}</CardDescription>
          </CardHeader>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <MetadataItem label="Default branch" value={data.repo.defaultBranch ?? "Unknown"} />
            <MetadataItem label="Analysis status" value={statusLabel(data.job?.status)} />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tech stack</CardTitle>
            <CardDescription>Detected from repository metadata and selected files.</CardDescription>
          </CardHeader>
          {data.techStack.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {data.techStack.map((item) => (
                <li
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700"
                  key={item}
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">No stack signals were detected yet.</p>
          )}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Architecture overview</CardTitle>
            <CardDescription>{data.architectureOverview}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning path</CardTitle>
            <CardDescription>Suggested order for getting oriented in the codebase.</CardDescription>
          </CardHeader>
          <ol className="space-y-3">
            {data.learningPath.map((step, index) => (
              <li className="flex gap-3 text-sm leading-6 text-slate-700" key={step}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-950 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <RepoGraphPanel repoId={data.repo.id} />

      <RepoChatPanel repoId={data.repo.id} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Important files</CardTitle>
            <CardDescription>Selected files with roles, languages, and summaries.</CardDescription>
          </CardHeader>
          <div className="divide-y divide-slate-200">
            {data.importantFiles.length > 0 ? (
              data.importantFiles.map((file) => (
                <article className="space-y-2 py-4 first:pt-0 last:pb-0" key={file.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-all font-mono text-sm font-semibold text-slate-950">
                      {file.path}
                    </h3>
                    <Tag>{file.role ?? "source"}</Tag>
                    {file.language ? <Tag>{file.language}</Tag> : null}
                  </div>
                  <p className="text-sm leading-6 text-slate-600">
                    {file.summary ?? "No summary was generated for this file."}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-600">No important files have been stored yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suggested contribution tasks</CardTitle>
            <CardDescription>Beginner-friendly tasks grounded in the analysis.</CardDescription>
          </CardHeader>
          <div className="space-y-4">
            {data.suggestedTasks.length > 0 ? (
              data.suggestedTasks.map((task) => (
                <article
                  className="rounded-md border border-slate-200 bg-slate-50 p-4"
                  key={`${task.title}-${task.paths.join(",")}`}
                >
                  <h3 className="text-sm font-semibold text-slate-950">{task.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{task.reason}</p>
                  {task.paths.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {task.paths.map((path) => (
                        <li className="font-mono text-xs text-slate-500" key={path}>
                          {path}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-600">No starter tasks were generated yet.</p>
            )}
          </div>
        </Card>
      </section>
    </DashboardShell>
  );
}

function DashboardShell({
  children,
  description,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  description?: string | null;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{eyebrow}</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h1 className="break-words text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-base leading-7 text-slate-600">{description}</p>
            ) : null}
          </div>
          <Link
            className="inline-flex h-10 w-fit items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-100"
            href="/"
          >
            Analyze another repo
          </Link>
        </div>
      </header>
      {children}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </Card>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
      {children}
    </span>
  );
}

function formatNumber(value: number | null): string {
  return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "Unknown";
}

function statusLabel(status: AnalysisJobStatus | undefined) {
  if (!status) {
    return "Not started";
  }

  return status[0].toUpperCase() + status.slice(1);
}
