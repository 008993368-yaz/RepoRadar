import { describe, expect, it } from "vitest";

import { createApiError, createApiSuccess } from "./api-response";

describe("api response helpers", () => {
  it("creates a typed success payload", () => {
    const payload = createApiSuccess({ repoId: "repo-123" });

    expect(payload).toEqual({
      ok: true,
      data: {
        repoId: "repo-123",
      },
    });
  });

  it("creates a typed error payload with optional details", () => {
    const payload = createApiError("not_found", "Repository not found", {
      repoUrl: "github.com/example/missing",
    });

    expect(payload).toEqual({
      ok: false,
      error: {
        code: "not_found",
        message: "Repository not found",
        details: {
          repoUrl: "github.com/example/missing",
        },
      },
    });
  });
});
