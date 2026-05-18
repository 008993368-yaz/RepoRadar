export type ApiSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

export function createApiSuccess<TData>(data: TData): ApiSuccess<TData> {
  return {
    ok: true,
    data,
  };
}

export function createApiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}
