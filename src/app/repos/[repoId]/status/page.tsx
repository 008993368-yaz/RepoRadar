import { RepoStatusPanel } from "@/components/repo-status-panel";

export default async function RepoStatusPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;

  return <RepoStatusPanel repoId={repoId} />;
}
