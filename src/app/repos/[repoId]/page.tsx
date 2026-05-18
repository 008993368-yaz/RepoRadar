import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export default async function RepoDashboardPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Repository {repoId}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Repository summary</CardTitle>
            <CardDescription>Stored AI summary will appear here.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Important files</CardTitle>
            <CardDescription>Selected file summaries will appear here.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Suggested tasks</CardTitle>
            <CardDescription>Beginner contribution ideas will appear here.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
