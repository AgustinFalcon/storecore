import { firstValueFrom, of } from 'rxjs';
import { ICartRepository } from '../cart.repository';
import { CheckoutCartUseCase } from './checkout-cart.usecase';

describe('CheckoutCartUseCase', () => {
  it('sends the same idempotency key the store already chose', async () => {
    const repo: ICartRepository = {
      read: () => of({ lines: [], currency: '' }),
      addLine: () => of({ lines: [], currency: '' }),
      checkout: (command) =>
        of({ orderId: 'o-1', paymentStatus: 'PENDING', orderStatus: 'CREATED', ...command }),
    };
    const useCase = new CheckoutCartUseCase(repo);
    const receipt = await firstValueFrom(
      useCase.execute({ idempotencyKey: 'same-key', addressId: 'addr-1', currency: 'ARS' }),
    );
    expect(receipt.orderId).toBe('o-1');
  });
});
