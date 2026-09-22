import { firstValueFrom, of } from 'rxjs';
import { CustomerSession } from '../../../core/auth/customer-session';
import { ICustomerRepository } from '../customer.repository';
import { SignInCustomerUseCase } from './sign-in-customer.usecase';

describe('SignInCustomerUseCase', () => {
  it('marks the cookie session without storing a token', async () => {
    const session = new CustomerSession();
    const repo: Pick<ICustomerRepository, 'signIn'> = {
      signIn: () => of({ id: '1', email: 'a@b.c', firstName: 'A', lastName: 'B' }),
    };
    const useCase = new SignInCustomerUseCase(repo as ICustomerRepository, session);
    await firstValueFrom(useCase.execute({ email: 'a@b.c', password: 'x' }));
    expect(session.authenticated()).toBe(true);
    expect(session.csrf()).toBe('');
  });
});
