import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoInputForm } from "./repo-input-form";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

describe("RepoInputForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.restoreAllMocks();
  });

  it("shows a clear error and does not call the API for invalid input", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RepoInputForm />);

    fireEvent.change(screen.getByLabelText("GitHub repository URL"), {
      target: { value: "https://gitlab.com/vercel/next.js" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

    expect(screen.getByText("Enter a GitHub repository like vercel/next.js.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("fills the input from an example repo button", () => {
    render(<RepoInputForm />);

    fireEvent.click(screen.getByRole("button", { name: "Use vercel/next.js" }));

    expect(screen.getByLabelText<HTMLInputElement>("GitHub repository URL").value).toBe(
      "vercel/next.js",
    );
  });

  it("posts valid input and redirects to the analysis status page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            repoId: "vercel-next.js",
            jobId: "stub-job-vercel-next.js",
            status: "queued",
          },
        }),
      }),
    );

    render(<RepoInputForm />);

    fireEvent.change(screen.getByLabelText("GitHub repository URL"), {
      target: { value: "github.com/vercel/next.js" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze" }));

    expect(await screen.findByRole("button", { name: "Analyzing..." })).toBeDisabled();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repoUrl: "https://github.com/vercel/next.js" }),
      });
      expect(pushMock).toHaveBeenCalledWith("/repos/vercel-next.js/status");
    });
  });
});
