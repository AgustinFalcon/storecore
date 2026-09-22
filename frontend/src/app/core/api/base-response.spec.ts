import { readApiBody } from './base-response';

describe('readApiBody', () => {
  it('unwraps an AssistTime success envelope', () => {
    expect(
      readApiBody<{ status: string }>({
        code: 200,
        data: { status: 'UP' },
        message: null,
        errorCode: null,
        retryable: null,
        traceId: null,
      }),
    ).toEqual({ status: 'UP' });
  });

  it('passes through a raw health payload', () => {
    expect(readApiBody<{ status: string }>({ status: 'UP' })).toEqual({ status: 'UP' });
  });

  it('unwraps a 201 register envelope', () => {
    expect(
      readApiBody<{ id: string }>({
        code: 201,
        data: { id: '9' },
        message: null,
        errorCode: null,
        retryable: null,
        traceId: null,
      }),
    ).toEqual({ id: '9' });
  });

  it('throws on an error envelope', () => {
    expect(() =>
      readApiBody({
        code: 403,
        data: null,
        message: 'Forbidden',
        errorCode: 'FORBIDDEN',
        retryable: false,
        traceId: 't-1',
      }),
    ).toThrow('Forbidden');
  });
});
