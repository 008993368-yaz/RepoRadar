export type JsonSchema = Record<string, unknown>;

export type GenerateJsonInput = {
  instructions: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
};

export type AiProvider = {
  generateJson<TValue>(input: GenerateJsonInput): Promise<TValue>;
};

export type AiProviderErrorCode =
  | "missing_api_key"
  | "api_error"
  | "network_error"
  | "incomplete_response"
  | "missing_output"
  | "invalid_json";

export class AiProviderError extends Error {
  constructor(
    public readonly code: AiProviderErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

type Fetcher = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

type OpenAiProviderOptions = {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
};

type OpenAiResponse = {
  status?: string;
  output_text?: unknown;
  output?: unknown;
  incomplete_details?: {
    reason?: unknown;
  } | null;
};

const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export function createOpenAiProvider(options: OpenAiProviderOptions = {}): AiProvider {
  const fetcher = options.fetcher ?? fetch;

  return {
    async generateJson<TValue>(input: GenerateJsonInput) {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new AiProviderError("missing_api_key", "OpenAI API key is not configured.");
      }

      let response: Awaited<ReturnType<Fetcher>>;
      try {
        response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
            instructions: input.instructions,
            input: input.input,
            ...(input.maxOutputTokens ? { max_output_tokens: input.maxOutputTokens } : {}),
            text: {
              format: {
                type: "json_schema",
                name: input.schemaName,
                strict: true,
                schema: input.schema,
              },
            },
          }),
        });
      } catch (error) {
        throw new AiProviderError("network_error", "OpenAI request could not be completed.", error);
      }

      if (!response.ok) {
        throw new AiProviderError(
          "api_error",
          `OpenAI request failed with status ${response.status}.`,
          await safeReadText(response),
        );
      }

      const payload = (await response.json()) as OpenAiResponse;
      if (payload.status === "incomplete") {
        const reason =
          typeof payload.incomplete_details?.reason === "string"
            ? payload.incomplete_details.reason
            : "unknown";
        throw new AiProviderError(
          "incomplete_response",
          `OpenAI response was incomplete: ${reason}.`,
        );
      }

      const outputText = extractOutputText(payload);
      if (!outputText) {
        throw new AiProviderError("missing_output", "OpenAI response did not contain output text.");
      }

      try {
        return JSON.parse(outputText) as TValue;
      } catch (error) {
        throw new AiProviderError(
          "invalid_json",
          "OpenAI response did not contain valid JSON.",
          error,
        );
      }
    },
  };
}

function extractOutputText(payload: OpenAiResponse): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim() !== "") {
    return payload.output_text;
  }

  if (!Array.isArray(payload.output)) {
    return null;
  }

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!isRecord(content)) {
        continue;
      }
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string" &&
        content.text.trim() !== ""
      ) {
        return content.text;
      }
    }
  }

  return null;
}

export function createFallbackAiProvider(): AiProvider {
  return {
    async generateJson<TValue>(): Promise<TValue> {
      throw new AiProviderError("missing_api_key", "OpenAI API key is not configured.");
    },
  };
}

async function safeReadText(response: { text(): Promise<string> }): Promise<string | null> {
  try {
    return await response.text();
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
