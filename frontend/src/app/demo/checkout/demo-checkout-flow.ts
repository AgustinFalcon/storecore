import type { DemoAddress } from './checkout-model';
import { CheckoutStep } from '../demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';

export class DemoCheckoutIssue {
  private constructor(readonly wire: string, readonly message: string) {}

  static readonly None = new DemoCheckoutIssue('NONE', '');
  static readonly MissingAddress = new DemoCheckoutIssue('MISSING_ADDRESS', 'Seleccioná una dirección o retiro en el comercio.');
  static readonly MissingDelivery = new DemoCheckoutIssue('MISSING_DELIVERY', 'Confirmá la entrega; domicilio requiere una dirección válida.');
  static readonly MissingPayment = new DemoCheckoutIssue('MISSING_PAYMENT', 'Seleccioná pago y entrega.');
  static readonly Unknown = new DemoCheckoutIssue('', 'No se pudo validar el paso de compra.');
  static readonly all = [this.None, this.MissingAddress, this.MissingDelivery, this.MissingPayment] as const;

  static fromWire(raw: unknown): DemoCheckoutIssue {
    return this.all.find(issue => issue.wire === raw) ?? this.Unknown;
  }
}

export interface DemoCheckoutAdvance {
  readonly step: CheckoutStep;
  readonly issue: DemoCheckoutIssue;
}

interface CheckoutFacts { deliveryMethod: DemoDeliveryMethod; deliveryConfirmed: boolean; hasAddress: boolean; }
interface CheckoutStage { readonly step: CheckoutStep; validate(facts: CheckoutFacts): DemoCheckoutIssue; }
class AddressStage implements CheckoutStage {
  readonly step = CheckoutStep.Address;
  validate(facts: CheckoutFacts): DemoCheckoutIssue {
    return facts.deliveryMethod !== DemoDeliveryMethod.Pickup && !facts.hasAddress ? DemoCheckoutIssue.MissingAddress : DemoCheckoutIssue.None;
  }
}
class DeliveryStage implements CheckoutStage {
  readonly step = CheckoutStep.Delivery;
  validate(facts: CheckoutFacts): DemoCheckoutIssue {
    return !facts.deliveryConfirmed || facts.deliveryMethod === DemoDeliveryMethod.Unknown || (facts.deliveryMethod === DemoDeliveryMethod.Home && !facts.hasAddress) ? DemoCheckoutIssue.MissingDelivery : DemoCheckoutIssue.None;
  }
}
class ReviewStage implements CheckoutStage {
  readonly step = CheckoutStep.Review;
  validate(): DemoCheckoutIssue { return DemoCheckoutIssue.None; }
}

/** Pure step object: each transition validates only its own responsibility. */
export class DemoCheckoutFlow {
  private readonly stages: readonly CheckoutStage[] = [new AddressStage(), new DeliveryStage(), new ReviewStage()];
  advance(
    current: CheckoutStep,
    deliveryMethod: DemoDeliveryMethod,
    deliveryConfirmed: boolean,
    addresses: readonly DemoAddress[],
    addressId: string,
  ): DemoCheckoutAdvance {
    const index = this.stages.findIndex(stage => stage.step === current);
    if (index < 0) return { step: current, issue: DemoCheckoutIssue.Unknown };
    const issue = this.stages[index].validate({ deliveryMethod, deliveryConfirmed, hasAddress: addresses.some(address => address.id === addressId) });
    return { step: issue === DemoCheckoutIssue.None ? this.stages[index + 1]?.step ?? current : current, issue };
  }

  validateSubmission(paymentMethod: DemoPaymentMethod, deliveryMethod: DemoDeliveryMethod): DemoCheckoutIssue {
    return paymentMethod === DemoPaymentMethod.Unknown || deliveryMethod === DemoDeliveryMethod.Unknown
      ? DemoCheckoutIssue.MissingPayment
      : DemoCheckoutIssue.None;
  }
}
