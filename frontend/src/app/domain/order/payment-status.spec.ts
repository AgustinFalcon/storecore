import { PaymentStatus } from './payment-status';

describe('PaymentStatus', () => {
  it('translates known wires once', () => {
    expect(PaymentStatus.fromWire('PENDING')).toBe(PaymentStatus.Pending);
    expect(PaymentStatus.fromWire('APPROVED').label).toBe('Aprobado');
  });

  it('does not treat an unknown wire as a valid payment state', () => {
    expect(PaymentStatus.fromWire('PAID_OK')).toBe(PaymentStatus.Unknown);
    expect(PaymentStatus.fromWire('PAID_OK').label).toBe('Estado de pago no reconocido');
  });
});
