import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

const stages = [
  "Fetching metadata",
  "Reading file tree",
  "Parsing dependencies",
  "Generating summaries",
  "Building graph",
];

export default async function RepoStatusPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Analysis status
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Repository {repoId}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Analysis stages</CardTitle>
          <CardDescription>
            Workstream M will replace this placeholder with live job polling.
          </CardDescription>
        </CardHeader>
        <ol className="space-y-3">
          {stages.map((stage) => (
            <li className="rounded-md border border-slate-200 px-3 py-2 text-sm" key={stage}>
              {stage}
            </li>
          ))}
        </ol>
      </Card>
    </main>
  );
}
