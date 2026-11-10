import { HttpErrorResponse } from '@angular/common/http';
import { ApiErrorCode } from './api-error-code';

export function getApiErrorCode(err: unknown): ApiErrorCode {
  if (!(err instanceof HttpErrorResponse)) return ApiErrorCode.Unknown;
  const body = err.error as { errorCode?: unknown } | null;
  return ApiErrorCode.fromWire(body?.errorCode);
}

export function getApiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string; errorCode?: string } | null;
    const errorCode = getApiErrorCode(err);
    if (errorCode !== ApiErrorCode.Unknown) return errorCode.label;
    if (body?.message) {
      return body.message;
    }
    switch (err.status) {
      case 0:
        return 'El API de esta instalación no responde.';
      case 401:
        return 'La sesión expiró. Entrá de nuevo.';
      case 403:
        return 'No hay permiso para esta acción.';
      case 404:
        return 'El recurso solicitado no existe.';
      case 409:
        return 'El recurso cambió desde tu última lectura. Conservamos tus cambios; cargá la versión actual y revisalos antes de volver a publicar.';
      case 500:
      case 502:
      case 503:
        return 'Error del API. Intentá de nuevo.';
      default:
        return `El API respondió ${err.status}.`;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Ocurrió un error inesperado.';
}
