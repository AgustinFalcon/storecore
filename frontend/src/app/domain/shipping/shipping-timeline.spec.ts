import { MilestonePaint } from '../order/order-milestone';
import { ShippingChoice } from '../order/closed-status';
import { ShippingSimStatus } from './shipping.entity';
import { formatArrival, nextSimStatus, pathFor, shippingSteps } from './shipping-timeline';

const now = new Date('2026-09-26T15:00:00Z');

describe('shipping simulation path', () => {
  it('ends pickup at ready for pickup', () => {
    expect(pathFor(ShippingChoice.Pickup)).toEqual([
      ShippingSimStatus.Confirmed,
      ShippingSimStatus.Preparing,
      ShippingSimStatus.Packed,
      ShippingSimStatus.ReadyForPickup,
    ]);
    expect(nextSimStatus(ShippingChoice.Pickup, ShippingSimStatus.ReadyForPickup)).toBeNull();
    expect(nextSimStatus(ShippingChoice.Pickup, ShippingSimStatus.Packed)).toBe(ShippingSimStatus.ReadyForPickup);
  });

  it('walks a dispatch through the arrival date', () => {
    expect(pathFor(ShippingChoice.Standard)).toEqual([
      ShippingSimStatus.Confirmed,
      ShippingSimStatus.Preparing,
      ShippingSimStatus.Packed,
      ShippingSimStatus.Dispatched,
      ShippingSimStatus.Arriving,
    ]);
    expect(nextSimStatus(ShippingChoice.Express, ShippingSimStatus.Dispatched)).toBe(ShippingSimStatus.Arriving);
    expect(nextSimStatus(ShippingChoice.Standard, ShippingSimStatus.Arriving)).toBeNull();
  });

  it('does not give pickup a carrier date', () => {
    const steps = shippingSteps(ShippingChoice.Pickup, ShippingSimStatus.Confirmed, now);
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
    const steps = shippingSteps(ShippingChoice.Standard, ShippingSimStatus.Confirmed, now);
    const dispatch = steps.find((step) => step.id === ShippingSimStatus.Dispatched);
    expect(dispatch?.state).toBe(MilestonePaint.Upcoming);
    expect(dispatch?.label).toBe('Despacho');
    expect(dispatch?.detail).toContain('Después');
  });

  it('names the simulated arrival and marks only the current step', () => {
    const steps = shippingSteps(ShippingChoice.Express, ShippingSimStatus.Arriving, now);
    expect(steps.at(-1)?.label).toBe(formatArrival(new Date('2026-09-28T15:00:00Z')));
    expect(steps.at(-1)?.state).toBe(MilestonePaint.Current);
    expect(steps[0].state).toBe(MilestonePaint.Done);
    expect(steps.at(-1)?.label).toContain('Tu envío llega el');
  });

  it('keeps an unknown status off the path', () => {
    expect(ShippingSimStatus.fromWire('CADUCO')).toBe(ShippingSimStatus.Unknown);
    expect(nextSimStatus(ShippingChoice.Standard, ShippingSimStatus.Unknown)).toBeNull();
    const steps = shippingSteps(ShippingChoice.Standard, ShippingSimStatus.Unknown, now);
    expect(steps.map((step) => step.id)).toEqual([ShippingSimStatus.Unknown]);
    expect(steps[0].state).toBe(MilestonePaint.Current);
  });
});
