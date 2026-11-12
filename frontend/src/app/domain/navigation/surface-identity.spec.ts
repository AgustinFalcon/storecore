import { NotFoundRecovery, SurfaceIdentity, SurfaceTarget } from './surface-identity';

describe('canonical surface identity', () => {
  it('round trips every closed surface and excludes the remaining Demo-only Real routes', () => {
    expect(SurfaceIdentity.all).toHaveLength(26);
    expect(new Set(SurfaceIdentity.all.map(surface => surface.wire)).size).toBe(26);
    for (const surface of SurfaceIdentity.all) {
      expect(SurfaceIdentity.fromWire(surface.wire)).toBe(surface);
      expect(SurfaceIdentity.fromMatchedPath(surface.path, SurfaceTarget.Demo)).toBe(surface);
      expect(SurfaceIdentity.fromMatchedPath(surface.path, SurfaceTarget.Real)).toBe(surface.real ? surface : SurfaceIdentity.Unknown);
    }
    expect(SurfaceIdentity.all.filter(surface => !surface.real)).toEqual([]);
    expect(SurfaceIdentity.fromMatchedPath('reset-password', SurfaceTarget.Real)).toBe(SurfaceIdentity.Recovery);
  });
  it('fails closed for unknown wires, targets and nested route patterns', () => {
    for (const raw of [null, undefined, 'SC-SURF-27', '<script>', {}, 1]) expect(SurfaceIdentity.fromWire(raw)).toBe(SurfaceIdentity.Unknown);
    expect(SurfaceTarget.fromWire(SurfaceTarget.Demo.wire)).toBe(SurfaceTarget.Demo);
    expect(SurfaceTarget.fromWire(SurfaceTarget.Real.wire)).toBe(SurfaceTarget.Real);
    expect(SurfaceTarget.fromWire('future')).toBe(SurfaceTarget.Unknown);
    expect(SurfaceIdentity.fromMatchedPath('', SurfaceTarget.Unknown)).toBe(SurfaceIdentity.Unknown);
    for (const path of ['**', 'customer/**', 'user/**', 'catalog/:sku/**']) expect(SurfaceIdentity.fromMatchedPath(path, SurfaceTarget.Demo)).toBe(SurfaceIdentity.Unknown);
    expect(SurfaceIdentity.Unknown).not.toBe(SurfaceIdentity.Home);
  });
  it('keeps recovery destinations closed and safe', () => {
    expect(NotFoundRecovery.fromWire(NotFoundRecovery.Customer.wire)).toBe(NotFoundRecovery.Customer);
    expect(NotFoundRecovery.fromWire(NotFoundRecovery.User.wire)).toBe(NotFoundRecovery.User);
    for (const raw of ['https://external.invalid', '//external.invalid', 'future', null]) expect(NotFoundRecovery.fromWire(raw)).toBe(NotFoundRecovery.Unknown);
  });
});
