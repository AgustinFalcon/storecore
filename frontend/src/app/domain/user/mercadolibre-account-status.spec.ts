import { MercadoLibreAccountStatus } from './mercadolibre-account-status';

describe('MercadoLibreAccountStatus', () => {
  it('decodes every supported wire value and owns its presentation', () => {
    for (const status of [
      MercadoLibreAccountStatus.Disabled,
      MercadoLibreAccountStatus.ReadOnly,
      MercadoLibreAccountStatus.Active,
      MercadoLibreAccountStatus.Paused,
      MercadoLibreAccountStatus.Error,
    ]) {
      expect(MercadoLibreAccountStatus.fromWire(status.wire)).toBe(status);
      expect(status.label.length).toBeGreaterThan(0);
      expect(status.tone.length).toBeGreaterThan(0);
    }
  });

  it('fails closed for absent, legacy, or differently-cased states', () => {
    for (const raw of [null, undefined, '', 'active', 'CONNECTED', 1, true]) {
      expect(MercadoLibreAccountStatus.fromWire(raw)).toBe(MercadoLibreAccountStatus.Unknown);
    }
    expect(MercadoLibreAccountStatus.Unknown.isOperational).toBe(false);
    expect(MercadoLibreAccountStatus.Active.isOperational).toBe(true);
  });
});
