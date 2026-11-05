import { CheckoutStep } from '../demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { DemoCheckoutFlow, DemoCheckoutIssue } from './demo-checkout-flow';
import { DemoDeliveryQuote as Quote, DeliveryConfirmation as Confirmation } from './demo-delivery-quote';

describe('DemoCheckoutFlow', () => {
  const flow = new DemoCheckoutFlow();
  const addresses = [{ id: 'home', label: 'Casa', street: 'Calle 1', city: 'CABA', postal: '1000', primary: true }];
  const facts = { quote: Quote.create(DemoDeliveryMethod.Home, addresses[0], 5), confirmation: Confirmation.Pending, hasItems: true };

  it('validates each step independently and advances through closed steps', () => {
    expect(flow.advance(CheckoutStep.Address, { ...facts, quote: Quote.Unknown }).issue).toBe(DemoCheckoutIssue.MissingAddress);
    expect(flow.advance(CheckoutStep.Address, facts).step).toBe(CheckoutStep.Delivery);
    expect(flow.advance(CheckoutStep.Delivery, facts).issue).toBe(DemoCheckoutIssue.MissingDelivery);
    expect(flow.advance(CheckoutStep.Delivery, { ...facts, confirmation: Confirmation.Confirmed }).step).toBe(CheckoutStep.Review);
  });

  it('allows pickup without a postal address and fails unknown submission closed', () => {
    const pickup = { ...facts, quote: Quote.create(DemoDeliveryMethod.Pickup, undefined, 0), confirmation: Confirmation.Confirmed };
    expect(flow.advance(CheckoutStep.Address, pickup).issue).toBe(DemoCheckoutIssue.None);
    expect(flow.validateSubmission(DemoPaymentMethod.Unknown, pickup)).toBe(DemoCheckoutIssue.MissingPayment);
    expect(flow.validateSubmission(DemoPaymentMethod.Card, pickup)).toBe(DemoCheckoutIssue.None);
    expect(DemoCheckoutIssue.fromWire('invalid')).toBe(DemoCheckoutIssue.Unknown);
  });
  it('fails Unknown, empty, stale destination and unconfirmed submission closed', () => {
    for (const issue of DemoCheckoutIssue.all) expect(DemoCheckoutIssue.fromWire(issue.wire)).toBe(issue);
    expect(flow.advance(CheckoutStep.Unknown, facts).issue).toBe(DemoCheckoutIssue.Unknown);
    expect(flow.advance(CheckoutStep.Address, { ...facts, hasItems: false }).issue).toBe(DemoCheckoutIssue.EmptyCart);
    expect(flow.validateSubmission(DemoPaymentMethod.Card, facts)).toBe(DemoCheckoutIssue.MissingDelivery);
    expect(flow.validateSubmission(DemoPaymentMethod.Card, { ...facts, quote: Quote.Unknown })).toBe(DemoCheckoutIssue.MissingAddress);
    expect(flow.validateSubmission(DemoPaymentMethod.Card, { ...facts, hasItems: false })).toBe(DemoCheckoutIssue.EmptyCart);
  });
});
