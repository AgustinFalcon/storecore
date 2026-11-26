import { RouteEvidenceMode, RouteScenario } from './route-evidence';
import { CalendarUuid } from '../../domain/commercial-calendar/calendar';
import { NotificationId } from '../../domain/notification/notification';

export interface RealFixtureProduct {
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly name: string;
}

export interface RealFixtureScenario {
  readonly scenario: RouteScenario;
  readonly evidence: RouteEvidenceMode;
}

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid real fixture receipt object');
  return raw as Record<string, unknown>;
}
function text(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw !== raw.trim() || [...raw].some(character => character.charCodeAt(0) < 32)) throw new Error('Invalid real fixture receipt text');
  return raw;
}
function identifier(raw: unknown): string {
  const value = text(raw);
  if (!/^[1-9]\d*$/.test(value)) throw new Error('Invalid real fixture receipt identifier');
  return value;
}
function sku(raw: unknown): string {
  const value = text(raw);
  if (value.startsWith('ROUTE-')) throw new Error('Synthetic route SKU is not real evidence');
  return value;
}
function positive(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw <= 0) throw new Error('Invalid real fixture receipt number');
  return raw;
}
function array(raw: unknown): readonly unknown[] {
  if (!Array.isArray(raw) || !raw.length) throw new Error('Invalid real fixture receipt array');
  return raw;
}
function unique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new Error('Duplicate real fixture receipt identity');
}

/** Untrusted JSON enters once. No guessed IDs, fixture defaults or unknown scenarios. */
export class RealRouteReceipt {
  private constructor(
    readonly scenarioPrefix: string,
    readonly products: readonly RealFixtureProduct[],
    readonly customerId: number,
    readonly customerEmail: string,
    readonly addressId: string,
    readonly addressRevision: string,
    readonly pendingOrderId: string,
    readonly offerId: number,
    readonly cart: { readonly revision: string; readonly skus: readonly string[] },
    readonly addressStreet: string,
    readonly homeTitle: string,
    readonly scenarios: readonly RealFixtureScenario[],
    readonly notification: { readonly id: NotificationId; readonly sourceId: string } | null,
    readonly commercialCalendar: { readonly eventId: CalendarUuid; readonly title: string } | null,
  ) { Object.freeze(this); }

  static fromWire(raw: unknown): RealRouteReceipt {
    const value = record(raw);
    if (value['schemaVersion'] !== 1) throw new Error('Unsupported real fixture receipt version');
    const products = array(value['products']).map(item => {
      const product = record(item);
      return Object.freeze({ productId: identifier(product['productId']), variantId: identifier(product['variantId']),
        sku: sku(product['sku']), name: text(product['name']) });
    });
    unique(products.map(product => product.productId));
    unique(products.map(product => product.variantId));
    unique(products.map(product => product.sku));
    const cart = record(value['cart']);
    const skus = array(cart['skus']).map(text);
    unique(skus);
    if (skus.some(sku => !products.some(product => product.sku === sku))) throw new Error('Cart is outside real fixture receipt');
    const scenarios = array(value['scenarios']).map(item => {
      const row = record(item);
      const scenario = RouteScenario.fromWire(row['scenario']);
      const evidence = RouteEvidenceMode.fromWire(row['evidence']);
      if (scenario === RouteScenario.Unknown || evidence !== RouteEvidenceMode.RealBackend) throw new Error('Unknown or non-strict real fixture scenario');
      return Object.freeze({ scenario, evidence });
    });
    unique(scenarios.map(item => item.scenario.wire));
    const addressRevision = text(value['addressRevision']);
    if (!Number.isFinite(Date.parse(addressRevision))) throw new Error('Invalid address revision');
    const email = text(value['customerEmail']);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid fixture customer email');
    const notification = value['notification'] === undefined ? null : (() => {
      const row = record(value['notification']), id = NotificationId.fromWire(row['id']);
      if (id === NotificationId.Unknown) throw new Error('Invalid persisted notification identifier');
      return Object.freeze({ id, sourceId: text(row['sourceId']) });
    })();
    const commercialCalendar = value['commercialCalendar'] === undefined ? null : (() => {
      const row = record(value['commercialCalendar']);
      if (Object.keys(row).sort().join(',') !== 'eventId,title') throw new Error('Invalid persisted calendar receipt fields');
      const eventId = CalendarUuid.fromWire(row['eventId']);
      if (!eventId) throw new Error('Invalid persisted calendar event identifier');
      return Object.freeze({ eventId, title: text(row['title']) });
    })();
    return new RealRouteReceipt(text(value['scenarioPrefix']), Object.freeze(products), positive(value['customerId']), email,
      identifier(value['addressId']), addressRevision, identifier(value['pendingOrderId']),
      positive(value['offerId']), Object.freeze({ revision: text(cart['revision']), skus: Object.freeze(skus) }),
      text(value['addressStreet']), text(value['homeTitle']), Object.freeze(scenarios), notification, commercialCalendar);
  }

  requireScenario(scenario: RouteScenario): void {
    if (!this.scenarios.some(row => row.scenario === scenario)) throw new Error('Missing real fixture scenario');
  }
}
