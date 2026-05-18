import { Button, Card, CardDescription, CardHeader, CardTitle, Input } from "@/components/ui";

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
          <CardTitle>Repository analysis entry point</CardTitle>
          <CardDescription>
            Workstream B will connect this shell to validation and the analysis API.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input aria-label="GitHub repository URL" placeholder="github.com/vercel/next.js" />
          <Button className="sm:w-40">Analyze</Button>
        </div>
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
