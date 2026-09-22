import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { ProbeUserSessionUseCase } from '../../domain/user/use-cases/probe-user-session.usecase';
import { UserSession } from './user-session';
import { userGuard } from './user.guard';

describe('userGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ProbeUserSessionUseCase,
          useValue: { execute: () => throwError(() => new Error('no cookie')) },
        },
      ],
    });
  });

  it('redirects to user session when /me fails', () => {
    const result = TestBed.runInInjectionContext(() => userGuard({} as never, {} as never));
    if (typeof result === 'object' && result && 'subscribe' in result) {
      let url = '';
      result.subscribe((value) => {
        url = String(value);
      });
      expect(url).toContain('/user/session');
      return;
    }
    expect(String(result)).toContain('/user/session');
  });

  it('allows the route when the user session is already marked', () => {
    TestBed.inject(UserSession).markAuthenticated();
    const result = TestBed.runInInjectionContext(() => userGuard({} as never, {} as never));
    expect(result).toBe(true);
  });
});
