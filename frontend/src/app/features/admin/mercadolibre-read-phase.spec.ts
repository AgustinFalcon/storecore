import { MercadoLibreReadPhase } from './mercadolibre-read-phase';

describe('MercadoLibreReadPhase', () => {
  it('decodes the complete closed lifecycle and owns its labels', () => {
    for (const phase of [
      MercadoLibreReadPhase.Idle,
      MercadoLibreReadPhase.Loading,
      MercadoLibreReadPhase.Refreshing,
      MercadoLibreReadPhase.Ready,
      MercadoLibreReadPhase.Stale,
      MercadoLibreReadPhase.Error,
      MercadoLibreReadPhase.AccessDenied,
      MercadoLibreReadPhase.Unknown,
    ]) {
      expect(MercadoLibreReadPhase.fromWire(phase.wire)).toBe(phase);
      expect(phase.label.length).toBeGreaterThan(0);
    }
  });

  it('fails closed for unknown wire values', () => {
    for (const raw of [null, undefined, '', 'ready', 'CONNECTED', 1, true]) {
      expect(MercadoLibreReadPhase.fromWire(raw)).toBe(MercadoLibreReadPhase.Unknown);
    }
  });
});
