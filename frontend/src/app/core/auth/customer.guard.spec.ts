import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProbeCustomerSessionUseCase } from '../../domain/customer/use-cases/probe-customer-session.usecase';
import { CustomerSession } from './customer-session';
import { customerGuard } from './customer.guard';

describe('customerGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ProbeCustomerSessionUseCase,
          useValue: { execute: () => throwError(() => new Error('no cookie')) },
        },
      ],
    });
  });

  it('redirects to customer session when /me fails', () => {
    const result = TestBed.runInInjectionContext(() => customerGuard({} as never, {} as never));
    if (typeof result === 'object' && result && 'subscribe' in result) {
      let url = '';
      result.subscribe((value) => {
        url = String(value);
      });
      expect(url).toContain('/customer/session');
      return;
    }
    expect(String(result)).toContain('/customer/session');
  });

  it('allows the route when the customer session is already marked', () => {
    TestBed.inject(CustomerSession).markAuthenticated();
    const result = TestBed.runInInjectionContext(() => customerGuard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('allows the route after a successful /me probe', () => {
    TestBed.overrideProvider(ProbeCustomerSessionUseCase, {
      useValue: {
        execute: () => {
          TestBed.inject(CustomerSession).markAuthenticated();
          return of({ email: 'a@b.c', firstName: 'A', lastName: 'B', phone: '' });
        },
      },
    });
    const result = TestBed.runInInjectionContext(() => customerGuard({} as never, {} as never));
    if (typeof result === 'object' && result && 'subscribe' in result) {
      let allowed = false;
      result.subscribe((value) => {
        allowed = value === true;
      });
      expect(allowed).toBe(true);
      return;
    }
    expect(result).toBe(true);
  });
});
