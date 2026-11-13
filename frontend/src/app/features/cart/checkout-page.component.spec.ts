import { CartStore } from './cart.store';
import { CheckoutPageComponent } from './checkout-page.component';

describe('CheckoutPageComponent retry routing', () => {
  it('reloads both reads without replaying a checkout', () => {
    const store = {
      submitCheckout: vi.fn(),
      load: vi.fn(),
      loadAddresses: vi.fn(),
    };
    const component = new CheckoutPageComponent(store as unknown as CartStore);

    component.reload();

    expect(store.submitCheckout).not.toHaveBeenCalled();
    expect(store.load).toHaveBeenCalledOnce();
    expect(store.loadAddresses).toHaveBeenCalledOnce();
  });

  it('reloads reads when the failure is not a recoverable checkout attempt', () => {
    const store = {
      submitCheckout: vi.fn(),
      load: vi.fn(),
      loadAddresses: vi.fn(),
    };
    const component = new CheckoutPageComponent(store as unknown as CartStore);

    component.reload();

    expect(store.submitCheckout).not.toHaveBeenCalled();
    expect(store.load).toHaveBeenCalledOnce();
    expect(store.loadAddresses).toHaveBeenCalledOnce();
  });
});
