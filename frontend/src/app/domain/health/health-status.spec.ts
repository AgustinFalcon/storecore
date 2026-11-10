import { HealthStatus } from './health-status';

describe('HealthStatus', () => {
  it('translates the only supported wire value', () => {
    expect(HealthStatus.fromWire('UP')).toBe(HealthStatus.Up);
    expect(HealthStatus.Up.ready).toBe(true);
    expect(HealthStatus.Up.label).toBe('Disponible');
  });

  it.each([undefined, null, '', 'up', 'DOWN', 'DEGRADED', 1, { status: 'UP' }])(
    'maps unsupported wire value %p to Unknown',
    (raw) => {
      expect(HealthStatus.fromWire(raw)).toBe(HealthStatus.Unknown);
      expect(HealthStatus.Unknown.ready).toBe(false);
    },
  );
});
