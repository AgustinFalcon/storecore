import { ShippingChoice } from '../order/closed-status';
import { coverageFor, distanceKm } from './shipping-coverage';

const origin = { latitude: -34.6037, longitude: -58.3816 };

describe('shipping coverage', () => {
  it('rejects a missing pin', () => {
    expect(coverageFor(ShippingChoice.Standard, { latitude: null, longitude: null }, origin).ok).toBe(false);
  });

  it('keeps pickup inside coverage once the pin is registered', () => {
    const far = { latitude: -31.4, longitude: -64.2 };
    expect(coverageFor(ShippingChoice.Pickup, far, origin).ok).toBe(true);
  });

  it('accepts standard and rejects express past 10 km', () => {
    const pin = { latitude: -34.8, longitude: -58.3816 };
    const kilometers = distanceKm(origin, pin);
    expect(kilometers).toBeGreaterThan(10);
    expect(kilometers).toBeLessThan(25);
    expect(coverageFor(ShippingChoice.Standard, pin, origin).ok).toBe(true);
    expect(coverageFor(ShippingChoice.Express, pin, origin).ok).toBe(false);
  });

  it('does not validate a dispatch without an installation origin', () => {
    const pin = { latitude: -34.61, longitude: -58.38 };
    expect(coverageFor(ShippingChoice.Standard, pin, { latitude: null, longitude: null }).ok).toBe(false);
  });

  it('rejects an unknown option', () => {
    const pin = { latitude: -34.61, longitude: -58.38 };
    expect(coverageFor(ShippingChoice.Unknown, pin, origin).ok).toBe(false);
  });
});