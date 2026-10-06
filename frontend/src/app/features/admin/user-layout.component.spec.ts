import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { UserLayoutComponent } from './user-layout.component';

describe('UserLayoutComponent logout', () => {
  it('submits only its realm, exhausts clicks and navigates only after successful revocation', () => {
    const response = new Subject<void>();
    const access = { logout: vi.fn(() => response) };
    const router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({ providers: [UserLayoutComponent, { provide: AccessCoordinator, useValue: access }, { provide: Router, useValue: router }] });
    const layout = TestBed.inject(UserLayoutComponent);
    layout.signOut(); layout.signOut();
    expect(access.logout).toHaveBeenCalledExactlyOnceWith(AccessContext.User);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    response.next(); response.complete();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
  it('keeps failed logout on the current screen with a retry message', () => {
    const router = { navigateByUrl: vi.fn() };
    TestBed.configureTestingModule({ providers: [UserLayoutComponent, { provide: AccessCoordinator, useValue: { logout: () => throwError(() => new Error('offline')) } }, { provide: Router, useValue: router }] });
    const layout = TestBed.inject(UserLayoutComponent);
    layout.signOut();
    expect(layout.logoutBusy()).toBe(false);
    expect(layout.logoutMessage()).toBeTruthy();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
