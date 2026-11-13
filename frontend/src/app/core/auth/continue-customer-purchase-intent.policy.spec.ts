import { AccessContext } from '../../domain/access/access-context';
import { ReturnDestination } from '../../domain/access/return-destination';
import { PurchaseIntentCoordinator } from '../purchase-intent/purchase-intent-coordinator';
import { ContinueCustomerPurchaseIntentPolicy } from './continue-customer-purchase-intent.policy';

describe('ContinueCustomerPurchaseIntentPolicy', () => {
  const intents = { validatedResumeReference: vi.fn(), continuationForCustomer: vi.fn() };
  const policy = new ContinueCustomerPurchaseIntentPolicy(intents as unknown as PurchaseIntentCoordinator);
  beforeEach(() => vi.resetAllMocks());
  it('delegates reference parsing to the single coordinator boundary', () => {
    intents.validatedResumeReference.mockReturnValue(null);
    for (const raw of [null, '%2F', 'x'.repeat(1000)]) expect(policy.reference(raw)).toBeNull();
    expect(intents.validatedResumeReference).toHaveBeenCalledTimes(3);
  });
  it('preserves authoritative routes for USER, incompatible destinations and missing intent', () => {
    intents.continuationForCustomer.mockReturnValue({ productSku: 'product', flowId: 'opaque' });
    for (const destination of [ReturnDestination.Cart, ReturnDestination.Checkout, ReturnDestination.CustomerOrders, ReturnDestination.Unknown]) {
      expect(policy.route(AccessContext.Customer, destination, '/original', 'opaque')).toBe('/original');
    }
    expect(policy.route(AccessContext.User, ReturnDestination.Catalog, '/user/home', 'opaque')).toBe('/user/home');
    expect(intents.continuationForCustomer).not.toHaveBeenCalled();
    intents.continuationForCustomer.mockReturnValue(null);
    expect(policy.route(AccessContext.Customer, ReturnDestination.Catalog, '/catalog', null)).toBe('/catalog');
  });
  it('reconstructs only the validated product route and opaque flow reference', () => {
    intents.continuationForCustomer.mockReturnValue({ productSku: 'producto / edición + azul', flowId: 'opaque_flow-1' });
    expect(policy.route(AccessContext.Customer, ReturnDestination.Catalog, '/catalog', 'opaque_flow-1'))
      .toBe('/catalog/producto%20%2F%20edici%C3%B3n%20%2B%20azul?resume=opaque_flow-1');
  });
});
