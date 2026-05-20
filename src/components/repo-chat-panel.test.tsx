import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepoChatPanel } from "./repo-chat-panel";

describe("RepoChatPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the empty chat state and composer", () => {
    render(<RepoChatPanel repoId="repo-123" />);

    expect(screen.getByRole("heading", { name: "Repo chat" })).toBeInTheDocument();
    expect(screen.getByText("Ask a question about this repository to get started.")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("keeps submit disabled for empty or whitespace-only messages", () => {
    render(<RepoChatPanel repoId="repo-123" />);

    const messageInput = screen.getByLabelText("Message");

    fireEvent.change(messageInput, { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("submits a message and appends the assistant answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            answer: "The main entry is src/app/page.tsx.",
            citations: [],
          },
        }),
      }),
    );

    render(<RepoChatPanel repoId="repo-123" />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Where is the home page?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Where is the home page?")).toBeInTheDocument();
    expect(await screen.findByText("The main entry is src/app/page.tsx.")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("");

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/repos/repo-123/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "Where is the home page?" }),
      });
    });
  });

  it("shows a loading state and disables input while waiting for the answer", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(<RepoChatPanel repoId="repo-123" />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain the auth flow" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByText("Thinking through the repo...")).toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({
        ok: true,
        data: {
          answer: "Auth is not implemented yet.",
          citations: [],
        },
      }),
    });

    expect(await screen.findByText("Auth is not implemented yet.")).toBeInTheDocument();
  });

  it("preserves prior messages and shows a readable API error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            answer: "The graph route returns dependencies.",
            citations: [],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: {
            code: "chat_failed",
            message: "Unable to answer from the current repo context.",
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<RepoChatPanel repoId="repo-123" />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "What does the graph route do?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("The graph route returns dependencies.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "What changed?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText("Unable to answer from the current repo context."),
    ).toBeInTheDocument();
    expect(screen.getByText("What does the graph route do?")).toBeInTheDocument();
    expect(screen.getByText("The graph route returns dependencies.")).toBeInTheDocument();
    expect(screen.getByText("What changed?")).toBeInTheDocument();
  });

  it("displays citations as compact path and reason items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            answer: "The input form starts analysis.",
            citations: [
              {
                path: "src/components/repo-input-form.tsx",
                reason: "Posts to the analyze endpoint",
              },
              {
                path: "src/app/api/analyze/route.ts",
                reason: "Queues repository analysis",
              },
            ],
          },
        }),
      }),
    );

    render(<RepoChatPanel repoId="repo-123" />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Where does analysis start?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("The input form starts analysis.")).toBeInTheDocument();
    expect(screen.getByText("src/components/repo-input-form.tsx")).toBeInTheDocument();
    expect(screen.getByText("Posts to the analyze endpoint")).toBeInTheDocument();
    expect(screen.getByText("src/app/api/analyze/route.ts")).toBeInTheDocument();
    expect(screen.getByText("Queues repository analysis")).toBeInTheDocument();
  });
});
