import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const RepoStatusPanelMock = vi.hoisted(() => vi.fn(({ repoId }: { repoId: string }) => (
  <section aria-label="Mock status panel">Status panel for {repoId}</section>
)));

vi.mock("@/components/repo-status-panel", () => ({
  RepoStatusPanel: RepoStatusPanelMock,
}));

import RepoStatusPage from "./page";

describe("RepoStatusPage", () => {
  it("renders the client status panel for the route repository id", async () => {
    render(await RepoStatusPage({ params: Promise.resolve({ repoId: "repo-uuid" }) }));

    expect(screen.getByLabelText("Mock status panel")).toHaveTextContent(
      "Status panel for repo-uuid",
    );
    expect(RepoStatusPanelMock).toHaveBeenCalledWith({ repoId: "repo-uuid" }, undefined);
  });
});
