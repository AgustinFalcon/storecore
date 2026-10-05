import { firstValueFrom, of } from 'rxjs';
import { CustomerSessionPort } from '../customer-session.port';
import { ICustomerRepository } from '../customer.repository';
import { SignInCustomerUseCase } from './sign-in-customer.usecase';

describe('SignInCustomerUseCase', () => {
  it('marks the cookie session without storing a token', async () => {
    let authenticated = false;
    const session: CustomerSessionPort = { markAuthenticated: () => { authenticated = true; }, generation: () => 0, clear: () => { authenticated = false; } };
    const repo: Pick<ICustomerRepository, 'signIn'> = {
      signIn: () => of({ id: '1', email: 'a@b.c', firstName: 'A', lastName: 'B' }),
    };
    const useCase = new SignInCustomerUseCase(repo as ICustomerRepository, session);
    await firstValueFrom(useCase.execute({ email: 'a@b.c', password: 'x' }));
    expect(authenticated).toBe(true);
  });
});
