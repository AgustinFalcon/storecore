import { HttpErrorResponse } from '@angular/common/http';
import { getApiErrorMessage } from './http-error.util';

describe('getApiErrorMessage', () => {
  it('prefers the API message on an HTTP error body', () => {
    expect(
      getApiErrorMessage(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Promo solapada' },
        }),
      ),
    ).toBe('Promo solapada');
  });

  it('maps a CSRF failure to an explicit retry', () => {
    expect(
      getApiErrorMessage(
        new HttpErrorResponse({
          status: 403,
          error: { errorCode: 'CSRF_INVALID', message: 'Request rejected' },
        }),
      ),
    ).toBe('La clave de seguridad venció. Reintentá la acción.');
  });

  it('maps an unavailable product without exposing the wire message', () => {
    expect(getApiErrorMessage(new HttpErrorResponse({
      status: 400,
      error: { errorCode: 'PRODUCT_NOT_SELLABLE', message: 'Request rejected' },
    }))).toBe('Hay productos que ya no están disponibles. Volvé al carrito y quitá esos artículos antes de pagar.');
  });

  it('maps an expired session', () => {
    expect(getApiErrorMessage(new HttpErrorResponse({ status: 401 }))).toBe(
      'La sesión expiró. Entrá de nuevo.',
    );
  });

  it('maps a network failure', () => {
    expect(getApiErrorMessage(new HttpErrorResponse({ status: 0 }))).toBe(
      'El API de esta instalación no responde.',
    );
  });

  it('uses Error.message from an unwrapped envelope', () => {
    expect(getApiErrorMessage(new Error('Forbidden'))).toBe('Forbidden');
  });
});
