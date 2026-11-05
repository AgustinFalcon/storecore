import { CheckoutStep } from '../demo-model';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { DeliveryConfirmation, DemoDeliveryQuote } from './demo-delivery-quote';

export class DemoCheckoutIssue {
  private constructor(readonly wire: string, readonly message: string) {}

  static readonly None = new DemoCheckoutIssue('NONE', '');
  static readonly MissingAddress = new DemoCheckoutIssue('MISSING_ADDRESS', 'Seleccioná una dirección o retiro en el comercio.');
  static readonly MissingDelivery = new DemoCheckoutIssue('MISSING_DELIVERY', 'Confirmá la entrega; domicilio requiere una dirección válida.');
  static readonly MissingPayment = new DemoCheckoutIssue('MISSING_PAYMENT', 'Seleccioná pago y entrega.');
  static readonly EmptyCart = new DemoCheckoutIssue('EMPTY_CART', 'Tu carrito está vacío. Elegí productos antes de continuar.');
  static readonly Unknown = new DemoCheckoutIssue('', 'No se pudo validar el paso de compra.');
  static readonly all = [this.None, this.MissingAddress, this.MissingDelivery, this.MissingPayment, this.EmptyCart] as const;

  static fromWire(raw: unknown): DemoCheckoutIssue {
    return this.all.find(issue => issue.wire === raw) ?? this.Unknown;
  }
}

export interface DemoCheckoutAdvance {
  readonly step: CheckoutStep;
  readonly issue: DemoCheckoutIssue;
}

export interface CheckoutFacts { readonly quote: DemoDeliveryQuote; readonly confirmation: DeliveryConfirmation; readonly hasItems: boolean; }
interface CheckoutStage { readonly step: CheckoutStep; validate(facts: CheckoutFacts): DemoCheckoutIssue; }
class AddressStage implements CheckoutStage {
  readonly step = CheckoutStep.Address;
  validate(facts: CheckoutFacts): DemoCheckoutIssue {
    return !facts.quote.valid ? DemoCheckoutIssue.MissingAddress : DemoCheckoutIssue.None;
  }
}
class DeliveryStage implements CheckoutStage {
  readonly step = CheckoutStep.Delivery;
  validate(facts: CheckoutFacts): DemoCheckoutIssue {
    return !facts.quote.valid || facts.confirmation !== DeliveryConfirmation.Confirmed ? DemoCheckoutIssue.MissingDelivery : DemoCheckoutIssue.None;
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
    facts: CheckoutFacts,
  ): DemoCheckoutAdvance {
    const index = this.stages.findIndex(stage => stage.step === current);
    if (index < 0) return { step: current, issue: DemoCheckoutIssue.Unknown };
    const issue = !facts.hasItems ? DemoCheckoutIssue.EmptyCart : this.stages[index].validate(facts);
    return { step: issue === DemoCheckoutIssue.None ? this.stages[index + 1]?.step ?? current : current, issue };
  }

  validateSubmission(paymentMethod: DemoPaymentMethod, facts: CheckoutFacts): DemoCheckoutIssue {
    if (!facts.hasItems) return DemoCheckoutIssue.EmptyCart;
    if (!facts.quote.valid || facts.quote.method === DemoDeliveryMethod.Unknown) return DemoCheckoutIssue.MissingAddress;
    if (facts.confirmation !== DeliveryConfirmation.Confirmed) return DemoCheckoutIssue.MissingDelivery;
    return paymentMethod === DemoPaymentMethod.Unknown ? DemoCheckoutIssue.MissingPayment : DemoCheckoutIssue.None;
  }
}
