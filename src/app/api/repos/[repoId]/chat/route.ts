import { createApiError, createApiSuccess } from "@/lib/api-response";
import { AiProviderError } from "@/lib/ai-provider";
import { AppDatabaseError } from "@/lib/repo-database";
import { RepoChatServiceError, answerRepoChatQuestion } from "@/lib/repo-chat";

type RepoChatRouteContext = {
  params: Promise<{ repoId: string }>;
};

const serviceErrorStatus: Record<string, number> = {
  repo_not_found: 404,
  analysis_incomplete: 409,
  analysis_failed: 409,
  invalid_request: 400,
  configuration_error: 500,
  database_error: 500,
  ai_error: 500,
  invalid_ai_response: 500,
};

export async function POST(request: Request, context: RepoChatRouteContext) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(createApiError("invalid_request", "Request body must be valid JSON."), {
      status: 400,
    });
  }

  const message =
    typeof body === "object" && body !== null
      ? (body as { message?: unknown }).message
      : undefined;

  if (typeof message !== "string" || message.trim().length === 0) {
    return Response.json(createApiError("invalid_request", "Message is required."), { status: 400 });
  }

  const { repoId } = await context.params;

  try {
    const answer = await answerRepoChatQuestion({ repoId, message: message.trim() });

    return Response.json(createApiSuccess(answer));
  } catch (error) {
    if (error instanceof RepoChatServiceError) {
      return Response.json(createApiError(error.code, error.message), {
        status: serviceErrorStatus[error.code] ?? 500,
      });
    }

    if (error instanceof AppDatabaseError) {
      return Response.json(createApiError(error.code, error.message), { status: 500 });
    }

    if (error instanceof AiProviderError) {
      return Response.json(createApiError("ai_error", error.message), { status: 500 });
    }

    throw error;
  }
}
