import { CartFailureKind, CartStore } from './cart.store';
import { CheckoutPageComponent } from './checkout-page.component';

describe('CheckoutPageComponent retry routing', () => {
  it('replays a pending checkout instead of reloading the committed cart', () => {
    const store = {
      snapshot: { failureKind: CartFailureKind.CheckoutRetryable },
      submitCheckout: vi.fn(),
      load: vi.fn(),
      loadAddresses: vi.fn(),
    };
    const component = new CheckoutPageComponent(store as unknown as CartStore);

    component.retry();

    expect(store.submitCheckout).toHaveBeenCalledOnce();
    expect(store.load).not.toHaveBeenCalled();
    expect(store.loadAddresses).not.toHaveBeenCalled();
  });

  it('reloads reads when the failure is not a recoverable checkout attempt', () => {
    const store = {
      snapshot: { failureKind: CartFailureKind.Load },
      submitCheckout: vi.fn(),
      load: vi.fn(),
      loadAddresses: vi.fn(),
    };
    const component = new CheckoutPageComponent(store as unknown as CartStore);

    component.retry();

    expect(store.submitCheckout).not.toHaveBeenCalled();
    expect(store.load).toHaveBeenCalledOnce();
    expect(store.loadAddresses).toHaveBeenCalledOnce();
  });
});
