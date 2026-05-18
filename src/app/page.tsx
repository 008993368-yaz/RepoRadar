import { RepoInputForm } from "@/components/repo-input-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12">
      <section className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">RepoRadar</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950">
          Understand any GitHub repo in minutes
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-600">
          Workstream A foundation is ready for the repository analysis flow, dashboard,
          knowledge graph, and repo chat tracks.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Analyze a public repository</CardTitle>
          <CardDescription>
            Paste a GitHub URL or owner/repo shorthand to start the onboarding analysis.
          </CardDescription>
        </CardHeader>
        <RepoInputForm />
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {["GitHub pipeline", "Knowledge graph", "Repo chat"].map((title) => (
          <Card key={title}>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-2">
              Placeholder surface for the next parallel workstreams.
            </CardDescription>
          </Card>
        ))}
      </div>
    </main>
  );
}
