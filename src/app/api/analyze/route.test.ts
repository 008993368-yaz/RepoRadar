import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/analyze", () => {
  it("returns deterministic stub job data for a valid GitHub repo", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "github.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        repoId: "vercel-next.js",
        jobId: "stub-job-vercel-next.js",
        status: "queued",
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns a typed validation error for invalid repo input", async () => {
    const response = await POST(
      new Request("http://localhost/api/analyze", {
        method: "POST",
        body: JSON.stringify({ repoUrl: "https://gitlab.com/vercel/next.js" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_repo_url",
        message: "Enter a GitHub repository like vercel/next.js.",
      },
    });
    expect(response.status).toBe(400);
  });
});
