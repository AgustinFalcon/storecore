import { firstValueFrom, of } from 'rxjs';
import { IUserRepository } from '../user.repository';
import { UserRole } from '../user-role';
import { ProbeUserSessionUseCase } from './probe-user-session.usecase';
import { SignInUserUseCase } from './sign-in-user.usecase';

/** Pure session effects; constructor type inference also works with #146's port. */
class TestSession {
  private signedIn = false;
  authenticated(): boolean { return this.signedIn; }
  markAuthenticated(): void { this.signedIn = true; }
  clear(): void { this.signedIn = false; }
}

type SessionDependency = ConstructorParameters<typeof SignInUserUseCase>[1];

describe('internal session role identity', () => {
  for (const roles of [[UserRole.Admin], [UserRole.Operator], [UserRole.Unknown, UserRole.Operator]]) {
    it('accepts only the known privileges in a valid or mixed role collection', async () => {
      const profile = { id: '1', roles };
      const repo = { signIn: () => of(profile), readMe: () => of(profile), readCsrf: vi.fn(() => of(undefined)) };
      const session = new TestSession();
      const dependency = session as unknown as SessionDependency;
      const signIn = new SignInUserUseCase(repo as unknown as IUserRepository, dependency);
      expect(await firstValueFrom(signIn.execute({ email: 'a@example.test', password: 'long-password' }))).toBe(profile);
      expect(session.authenticated()).toBe(true);
      session.clear();
      const probe = new ProbeUserSessionUseCase(repo as unknown as IUserRepository, dependency);
      expect(await firstValueFrom(probe.execute())).toBe(profile);
      expect(session.authenticated()).toBe(true);
      expect(repo.readCsrf).toHaveBeenCalledOnce();
      expect(roles.includes(UserRole.Admin)).toBe(roles[0] === UserRole.Admin);
    });
  }

  for (const roles of [[], [UserRole.Unknown]]) {
    it('rejects empty or unknown-only roles and clears prior local identity', async () => {
      const profile = { id: '1', roles };
      const repo = { signIn: () => of(profile), readMe: () => of(profile), readCsrf: vi.fn(() => of(undefined)) };
      const session = new TestSession();
      const dependency = session as unknown as SessionDependency;
      session.markAuthenticated();
      const signIn = new SignInUserUseCase(repo as unknown as IUserRepository, dependency);
      await expect(firstValueFrom(signIn.execute({ email: 'a@example.test', password: 'long-password' }))).rejects.toThrow('sin rol reconocido');
      expect(session.authenticated()).toBe(false);
      session.markAuthenticated();
      const probe = new ProbeUserSessionUseCase(repo as unknown as IUserRepository, dependency);
      await expect(firstValueFrom(probe.execute())).rejects.toThrow('sin rol reconocido');
      expect(session.authenticated()).toBe(false);
      expect(repo.readCsrf).not.toHaveBeenCalled();
    });
  }
});
