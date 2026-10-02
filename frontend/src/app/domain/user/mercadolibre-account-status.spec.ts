import { MercadoLibreAccountStatus as Status } from './mercadolibre-account-status';

describe('MercadoLibreAccountStatus', () => {
  it('maps the closed set and grants active semantics only to Active', () => {
    for (const state of [Status.Disabled, Status.ReadOnly, Status.Active, Status.Paused, Status.Error]) {
      expect(Status.fromWire(` ${state.wire} `)).toBe(state);
      expect(state.isActive).toBe(state === Status.Active);
      expect(state.label).not.toBe('');
    }
  });

  it('collapses unrecognized or malformed wires into a fixed inactive Unknown', () => {
    for (const raw of ['FUTURE_ACCOUNT', '', 'active', null, undefined, 4, {}, ['ACTIVE']]) {
      expect(Status.fromWire(raw)).toBe(Status.Unknown);
    }
    expect(Status.Unknown.wire).toBe('unknown');
    expect(Status.Unknown.label).toBe('Estado no reconocido');
    expect(Status.Unknown.isActive).toBe(false);
  });
});
