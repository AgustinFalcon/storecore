import { formatArrival, nextSimStatus, pathFor, shippingSteps } from './shipping-timeline';

const now = new Date('2026-09-26T15:00:00Z');

describe('shipping simulation path', () => {
  it('ends pickup at ready for pickup', () => {
    expect(pathFor('PICKUP')).toEqual(['CONFIRMED', 'PREPARING', 'PACKED', 'READY_FOR_PICKUP']);
    expect(nextSimStatus('PICKUP', 'READY_FOR_PICKUP')).toBeNull();
    expect(nextSimStatus('PICKUP', 'PACKED')).toBe('READY_FOR_PICKUP');
  });

  it('walks a dispatch through the arrival date', () => {
    expect(pathFor('STANDARD')).toEqual(['CONFIRMED', 'PREPARING', 'PACKED', 'DISPATCHED', 'ARRIVING']);
    expect(nextSimStatus('EXPRESS', 'DISPATCHED')).toBe('ARRIVING');
    expect(nextSimStatus('STANDARD', 'ARRIVING')).toBeNull();
  });

  it('does not give pickup a carrier date', () => {
    const steps = shippingSteps('PICKUP', 'CONFIRMED', now);
    expect(steps.map((step) => step.label)).toEqual([
      'Pedido confirmado',
      'Pedido en preparación',
      'Empaquetado',
      'Listo para retirar',
    ]);
    expect(steps[3].detail).toContain('Después');
    expect(steps.some((step) => step.label.startsWith('Tu envío llega'))).toBe(false);
  });

  it('does not narrate a future dispatch as already sent', () => {
    const steps = shippingSteps('STANDARD', 'CONFIRMED', now);
    const dispatch = steps.find((step) => step.id === 'DISPATCHED');
    expect(dispatch?.state).toBe('upcoming');
    expect(dispatch?.label).toBe('Despacho');
    expect(dispatch?.detail).toContain('Después');
  });
  it('names the simulated arrival and marks only the current step', () => {
    const steps = shippingSteps('EXPRESS', 'ARRIVING', now);
    expect(steps.at(-1)?.label).toBe(formatArrival(new Date('2026-09-28T15:00:00Z')));
    expect(steps.at(-1)?.state).toBe('current');
    expect(steps[0].state).toBe('done');
    expect(steps.at(-1)?.label).toContain('Tu envío llega el');
  });
});
