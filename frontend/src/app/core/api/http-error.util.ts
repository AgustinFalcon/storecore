import { HttpErrorResponse } from '@angular/common/http';

export function getApiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { message?: string; errorCode?: string } | null;
    if (body?.errorCode === 'CSRF_INVALID') {
      return 'La clave de seguridad venció. Reintentá la acción.';
    }
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
