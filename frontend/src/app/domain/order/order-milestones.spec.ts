import { DocumentStatus, PaymentMethod, PaymentStatus, ShippingChoice, ShipmentStatus } from './closed-status';
import { orderMilestones } from './order-milestones';

describe('order milestones', () => {
  it('keeps the invoice as the current step when StoreCore has not issued it', () => {
    const steps = orderMilestones({
      payment: PaymentStatus.Approved,
      method: PaymentMethod.MercadoPago,
      shipment: ShipmentStatus.Pending,
      tracking: null,
      shipping: ShippingChoice.Standard,
      document: DocumentStatus.NotIssued,
    });
    expect(steps.find((step) => step.id === 'shipping')?.state).toBe('current');
    expect(steps.find((step) => step.id === 'invoice')?.state).toBe('upcoming');
    expect(steps.find((step) => step.id === 'invoice')?.detail).toContain('StoreCore factura');
    expect(steps.find((step) => step.id === 'preparing')?.state).toBe('upcoming');
  });

  it('shows the Correo Argentino number once the order has one', () => {
    const steps = orderMilestones({
      payment: PaymentStatus.Approved,
      method: PaymentMethod.Cash,
      shipment: ShipmentStatus.Shipped,
      tracking: 'CA-100',
      shipping: ShippingChoice.Express,
      document: DocumentStatus.Issued,
    });
    expect(steps.find((step) => step.id === 'dispatched')?.state).toBe('current');
    expect(steps.find((step) => step.id === 'dispatched')?.detail).toContain('CA-100');
    expect(steps.find((step) => step.id === 'invoice')?.state).toBe('done');
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
