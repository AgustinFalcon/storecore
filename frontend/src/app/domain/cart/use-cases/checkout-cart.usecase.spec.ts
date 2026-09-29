import { firstValueFrom, of } from 'rxjs';
import { OrderStatus, PaymentStatus } from '../../order/closed-status';
import { ICartRepository } from '../cart.repository';
import { CheckoutCartUseCase } from './checkout-cart.usecase';

describe('CheckoutCartUseCase', () => {
  it('sends the same idempotency key the store already chose', async () => {
    const repo: ICartRepository = {
      read: () => of({ lines: [], currency: '' }),
      addLine: () => of({ lines: [], currency: '' }),
      checkout: (command) =>
        of({ orderId: 'o-1', paymentStatus: PaymentStatus.Pending, orderStatus: OrderStatus.Created, ...command }),
    };
    const useCase = new CheckoutCartUseCase(repo);
    const receipt = await firstValueFrom(
      useCase.execute({ idempotencyKey: 'same-key', addressId: 'addr-1', currency: 'ARS', paymentMethod: 'MERCADO_PAGO' }),
    );
    expect(receipt.orderId).toBe('o-1');
  });

  it('passes through a remote checkout url without treating it as payment proof', async () => {
    const repo: ICartRepository = {
      read: () => of({ lines: [], currency: '' }),
      addLine: () => of({ lines: [], currency: '' }),
      checkout: () =>
        of({
          orderId: 'o-2',
          paymentStatus: PaymentStatus.Pending,
          orderStatus: OrderStatus.PendingPayment,
          checkoutUrl: 'https://www.mercadopago.com.ar/checkout/ORD-2',
        }),
    };
    const receipt = await firstValueFrom(
      new CheckoutCartUseCase(repo).execute({ idempotencyKey: 'k', addressId: 'addr-1', currency: 'ARS', paymentMethod: 'CASH' }),
    );
    expect(receipt.checkoutUrl).toBe('https://www.mercadopago.com.ar/checkout/ORD-2');
    expect(receipt.paymentStatus).toBe(PaymentStatus.Pending);
  });
});
