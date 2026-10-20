import { CheckoutStep } from '../demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { DemoCheckoutFlow, DemoCheckoutIssue } from './demo-checkout-flow';

describe('DemoCheckoutFlow', () => {
  const flow = new DemoCheckoutFlow();
  const addresses = [{ id: 'home', label: 'Casa', street: 'Calle 1', city: 'CABA', postal: '1000', primary: true }];

  it('validates each step independently and advances through closed steps', () => {
    expect(flow.advance(CheckoutStep.Address, DemoDeliveryMethod.Home, false, addresses, '').issue).toBe(DemoCheckoutIssue.MissingAddress);
    expect(flow.advance(CheckoutStep.Address, DemoDeliveryMethod.Home, false, addresses, 'home').step).toBe(CheckoutStep.Delivery);
    expect(flow.advance(CheckoutStep.Delivery, DemoDeliveryMethod.Home, false, addresses, 'home').issue).toBe(DemoCheckoutIssue.MissingDelivery);
    expect(flow.advance(CheckoutStep.Delivery, DemoDeliveryMethod.Home, true, addresses, 'home').step).toBe(CheckoutStep.Review);
  });

  it('allows pickup without a postal address and fails unknown submission closed', () => {
    expect(flow.advance(CheckoutStep.Address, DemoDeliveryMethod.Pickup, false, [], '').issue).toBe(DemoCheckoutIssue.None);
    expect(flow.validateSubmission(DemoPaymentMethod.Unknown, DemoDeliveryMethod.Pickup)).toBe(DemoCheckoutIssue.MissingPayment);
    expect(flow.validateSubmission(DemoPaymentMethod.Card, DemoDeliveryMethod.Pickup)).toBe(DemoCheckoutIssue.None);
    expect(DemoCheckoutIssue.fromWire('invalid')).toBe(DemoCheckoutIssue.Unknown);
  });
});
