import { LoadingState } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Repository dashboard
        </p>
        <div className="h-10 w-full max-w-md rounded-md bg-slate-200" />
      </header>
      <LoadingState label="Loading repository dashboard" />
    </main>
  );
}
