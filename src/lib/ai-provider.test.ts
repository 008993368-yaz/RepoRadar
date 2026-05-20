import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiProviderError, createOpenAiProvider } from "./ai-provider";

const schema = {
  type: "object",
  properties: {
    summary: { type: "string" },
  },
  required: ["summary"],
  additionalProperties: false,
};

describe("OpenAI provider", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OPENAI_API_KEY = "test-api-key";
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    process.env.OPENAI_MODEL = originalModel;
  });

  it("sends strict structured-output requests to the Responses API", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output_text: "{\"summary\":\"Grounded summary\"}",
      }),
    });
    const provider = createOpenAiProvider({ fetcher });

    const result = await provider.generateJson<{ summary: string }>({
      instructions: "Use only provided context.",
      input: "README.md: Project overview",
      schemaName: "repo_summary",
      schema,
    });

    expect(result).toEqual({ summary: "Grounded summary" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-api-key",
          "Content-Type": "application/json",
        },
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      model: "gpt-5.4-mini",
      instructions: "Use only provided context.",
      input: "README.md: Project overview",
      text: {
        format: {
          type: "json_schema",
          name: "repo_summary",
          strict: true,
          schema,
        },
      },
    });
  });

  it("uses OPENAI_MODEL when configured", async () => {
    process.env.OPENAI_MODEL = "gpt-5.5";
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output_text: "{\"summary\":\"Grounded summary\"}",
      }),
    });

    await createOpenAiProvider({ fetcher }).generateJson({
      instructions: "Use only provided context.",
      input: "content",
      schemaName: "repo_summary",
      schema,
    });

    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe("gpt-5.5");
  });

  it("reads structured output text from response message content", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "{\"summary\":\"Nested grounded summary\"}",
              },
            ],
          },
        ],
      }),
    });

    const result = await createOpenAiProvider({ fetcher }).generateJson<{ summary: string }>({
      instructions: "Use only provided context.",
      input: "content",
      schemaName: "repo_summary",
      schema,
    });

    expect(result).toEqual({ summary: "Nested grounded summary" });
  });

  it("throws a normalized error when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      createOpenAiProvider().generateJson({
        instructions: "Use only provided context.",
        input: "content",
        schemaName: "repo_summary",
        schema,
      }),
    ).rejects.toMatchObject({
      code: "missing_api_key",
      message: "OpenAI API key is not configured.",
    } satisfies Partial<AiProviderError>);
  });

  it("throws a normalized error for non-2xx responses", async () => {
    const provider = createOpenAiProvider({
      fetcher: vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "rate limited",
      }),
    });

    await expect(
      provider.generateJson({
        instructions: "Use only provided context.",
        input: "content",
        schemaName: "repo_summary",
        schema,
      }),
    ).rejects.toMatchObject({
      code: "api_error",
      message: "OpenAI request failed with status 429.",
    });
  });

  it("throws a normalized error for incomplete responses", async () => {
    const provider = createOpenAiProvider({
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output_text: "{\"summary\":\"partial\"}",
        }),
      }),
    });

    await expect(
      provider.generateJson({
        instructions: "Use only provided context.",
        input: "content",
        schemaName: "repo_summary",
        schema,
      }),
    ).rejects.toMatchObject({
      code: "incomplete_response",
      message: "OpenAI response was incomplete: max_output_tokens.",
    });
  });

  it("throws a normalized error for invalid JSON output", async () => {
    const provider = createOpenAiProvider({
      fetcher: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "completed",
          output_text: "not-json",
        }),
      }),
    });

    await expect(
      provider.generateJson({
        instructions: "Use only provided context.",
        input: "content",
        schemaName: "repo_summary",
        schema,
      }),
    ).rejects.toMatchObject({
      code: "invalid_json",
      message: "OpenAI response did not contain valid JSON.",
    });
  });
});
