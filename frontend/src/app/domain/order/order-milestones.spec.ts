import { DocumentStatus, PaymentMethod, PaymentStatus, ShippingChoice, ShipmentStatus } from './closed-status';
import { MilestonePaint } from './order-milestone';
import { orderMilestones } from './order-milestones';

describe('order milestones', () => {
  it('keeps the chosen shipping as the current step while this page does not emit', () => {
    const steps = orderMilestones({
      payment: PaymentStatus.Approved,
      method: PaymentMethod.MercadoPago,
      shipment: ShipmentStatus.Pending,
      tracking: null,
      shipping: ShippingChoice.Standard,
      document: DocumentStatus.NotIssued,
    });
    expect(steps.find((step) => step.id === 'shipping')?.state).toBe(MilestonePaint.Current);
    expect(steps.find((step) => step.id === 'invoice')?.state).toBe(MilestonePaint.Upcoming);
    expect(steps.find((step) => step.id === 'invoice')?.detail).toContain('Esta página no emite');
    expect(steps.find((step) => step.id === 'preparing')?.state).toBe(MilestonePaint.Upcoming);
  });

  it('shows the operator tracking number without calling Correo Argentino', () => {
    const steps = orderMilestones({
      payment: PaymentStatus.Approved,
      method: PaymentMethod.Cash,
      shipment: ShipmentStatus.Shipped,
      tracking: 'CA-100',
      shipping: ShippingChoice.Express,
      document: DocumentStatus.Issued,
    });
    expect(steps.find((step) => step.id === 'dispatched')?.state).toBe(MilestonePaint.Current);
    expect(steps.find((step) => step.id === 'dispatched')?.detail).toContain('CA-100');
    expect(steps.find((step) => step.id === 'dispatched')?.detail).toContain('no consulta a Correo Argentino');
    expect(steps.find((step) => step.id === 'invoice')?.state).toBe(MilestonePaint.Upcoming);
  });

  it('uses pickup labels and does not invent a carrier number', () => {
    const steps = orderMilestones({
      payment: PaymentStatus.Approved,
      method: PaymentMethod.Cash,
      shipment: ShipmentStatus.Packed,
      tracking: null,
      shipping: ShippingChoice.Pickup,
      document: DocumentStatus.Issued,
    });
    expect(steps.find((step) => step.id === 'ready')?.detail).toContain('No hay número');
    expect(steps.map((step) => step.id)).not.toContain('dispatched');
  });
});
