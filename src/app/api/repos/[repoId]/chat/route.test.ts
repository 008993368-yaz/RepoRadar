import { beforeEach, describe, expect, it, vi } from "vitest";

const { RepoChatServiceErrorMock, answerRepoChatQuestionMock } = vi.hoisted(() => {
  class RepoChatServiceError extends Error {
    code: string;

    constructor(code: string, message = "Repo chat failed.") {
      super(message);
      this.name = "RepoChatServiceError";
      this.code = code;
    }
  }

  return {
    RepoChatServiceErrorMock: RepoChatServiceError,
    answerRepoChatQuestionMock: vi.fn(),
  };
});

vi.mock("@/lib/repo-chat", () => ({
  RepoChatServiceError: RepoChatServiceErrorMock,
  answerRepoChatQuestion: answerRepoChatQuestionMock,
}));

import { AiProviderError } from "@/lib/ai-provider";
import { AppDatabaseError } from "@/lib/repo-database";
import { POST } from "./route";

describe("POST /api/repos/:repoId/chat", () => {
  beforeEach(() => {
    answerRepoChatQuestionMock.mockReset();
    answerRepoChatQuestionMock.mockResolvedValue({
      answer: "Start with the App Router files.",
      citations: [{ path: "src/app/page.tsx", reason: "Defines the main screen." }],
    });
  });

  it("returns an answer with citations for a valid repo chat question", async () => {
    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify({ message: "  Where should I start?  " }),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        answer: "Start with the App Router files.",
        citations: [{ path: "src/app/page.tsx", reason: "Defines the main screen." }],
      },
    });
    expect(answerRepoChatQuestionMock).toHaveBeenCalledWith({
      repoId: "repo-uuid",
      message: "Where should I start?",
    });
  });

  it("returns invalid_request for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: "{",
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Request body must be valid JSON.",
      },
    });
    expect(answerRepoChatQuestionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing message", {}],
    ["non-string message", { message: 42 }],
    ["empty message", { message: "   " }],
  ])("returns invalid_request for %s", async (_caseName, body) => {
    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_request",
        message: "Message is required.",
      },
    });
    expect(answerRepoChatQuestionMock).not.toHaveBeenCalled();
  });

  it("returns not found when the chat service cannot find the repository", async () => {
    answerRepoChatQuestionMock.mockRejectedValue(
      new RepoChatServiceErrorMock("repo_not_found", "Repository analysis was not found."),
    );

    const response = await POST(
      new Request("http://localhost/api/repos/missing/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What is this repo?" }),
      }),
      { params: Promise.resolve({ repoId: "missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "repo_not_found",
        message: "Repository analysis was not found.",
      },
    });
  });

  it("returns conflict when analysis is incomplete", async () => {
    answerRepoChatQuestionMock.mockRejectedValue(
      new RepoChatServiceErrorMock("analysis_incomplete", "Repository analysis is not ready yet."),
    );

    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What changed?" }),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "analysis_incomplete",
        message: "Repository analysis is not ready yet.",
      },
    });
  });

  it("returns conflict when analysis failed", async () => {
    answerRepoChatQuestionMock.mockRejectedValue(
      new RepoChatServiceErrorMock("analysis_failed", "Repository analysis failed."),
    );

    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What changed?" }),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "analysis_failed",
        message: "Repository analysis failed.",
      },
    });
  });

  it("returns server error when the AI chat service fails", async () => {
    answerRepoChatQuestionMock.mockRejectedValue(
      new RepoChatServiceErrorMock("ai_error", "AI service failed."),
    );

    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What changed?" }),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "ai_error",
        message: "AI service failed.",
      },
    });
  });

  it("returns server error when database configuration is missing", async () => {
    answerRepoChatQuestionMock.mockRejectedValue(
      new AppDatabaseError("configuration_error", "Supabase environment variables are not configured."),
    );

    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What changed?" }),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "configuration_error",
        message: "Supabase environment variables are not configured.",
      },
    });
  });

  it("returns server error when the AI provider throws directly", async () => {
    answerRepoChatQuestionMock.mockRejectedValue(
      new AiProviderError("api_error", "OpenAI request failed with status 429."),
    );

    const response = await POST(
      new Request("http://localhost/api/repos/repo-uuid/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What changed?" }),
      }),
      { params: Promise.resolve({ repoId: "repo-uuid" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "ai_error",
        message: "OpenAI request failed with status 429.",
      },
    });
  });
});
