export interface BaseResponse<T> {
  readonly code: number;
  readonly data: T | null;
  readonly message: string | null;
  readonly errorCode: string | null;
  readonly retryable: boolean | null;
  readonly traceId: string | null;
}

function isEnvelope(body: unknown): body is BaseResponse<unknown> {
  return Boolean(body && typeof body === 'object' && 'code' in body && 'data' in body);
}

/** Accepts AssistTime envelope or a raw payload so this UI works before and after the backend wraps responses. */
export function readApiBody<T>(body: unknown): T {
  if (isEnvelope(body)) {
    if ((body.code === 200 || body.code === 201) && body.data !== null && body.data !== undefined) {
      return body.data as T;
    }
    throw new Error(body.message ?? `Respuesta inválida (código ${body.code})`);
  }
  return body as T;
}
