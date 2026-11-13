import { firstValueFrom, of } from 'rxjs';
import { ICartRepository } from '../cart.repository';
import { CheckoutCartUseCase } from './checkout-cart.usecase';
import { PaymentStatus, OrderStatus } from '../../order/commerce-states';
import { CartCurrency } from '../cart-currency';

describe('CheckoutCartUseCase', () => {
  it('sends the same idempotency key the store already chose', async () => {
    const repo: ICartRepository = {
      read: () => of({ lines: [], currency: CartCurrency.Unknown }),
      addLine: () => of({ lines: [], currency: CartCurrency.Unknown }),
      checkout: (command) =>
        of({ orderId: 'o-1', paymentStatus: PaymentStatus.Pending, orderStatus: OrderStatus.Created, ...command }),
    };
    const useCase = new CheckoutCartUseCase(repo);
    const receipt = await firstValueFrom(
      useCase.execute({ idempotencyKey: 'same-key', addressId: 'addr-1', currency: CartCurrency.Ars }),
    );
    expect(receipt.orderId).toBe('o-1');
  });

  it('passes through a remote checkout url without treating it as payment proof', async () => {
    const repo: ICartRepository = {
      read: () => of({ lines: [], currency: CartCurrency.Unknown }),
      addLine: () => of({ lines: [], currency: CartCurrency.Unknown }),
      checkout: () =>
        of({
          orderId: 'o-2',
          paymentStatus: PaymentStatus.Pending,
          orderStatus: OrderStatus.PendingPayment,
          checkoutUrl: 'https://www.mercadopago.com.ar/checkout/ORD-2',
        }),
    };
    const receipt = await firstValueFrom(
      new CheckoutCartUseCase(repo).execute({ idempotencyKey: 'k', addressId: 'addr-1', currency: CartCurrency.Ars }),
    );
    expect(receipt.checkoutUrl).toBe('https://www.mercadopago.com.ar/checkout/ORD-2');
    expect(receipt.paymentStatus).toBe(PaymentStatus.Pending);
  });
});
