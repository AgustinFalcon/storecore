import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { UserRole } from '../../domain/user/user-role';
import { UserAction } from './user-action';
import { UserHomeComponent } from './user-home.component';

describe('UserHomeComponent', () => {
  it('refreshes links when current roles change and removes all actions on session loss', () => {
    TestBed.configureTestingModule({ imports: [UserHomeComponent], providers: [provideRouter([])] });
    const session = TestBed.inject(UserSession);
    session.commit({ id: 'user-1', roles: [UserRole.Admin] }, 'csrf');
    const fixture = TestBed.createComponent(UserHomeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.actions()).toContain(UserAction.Promos);
    session.commit({ id: 'user-1', roles: [UserRole.Operator] }, 'csrf');
    fixture.detectChanges();
    expect(fixture.componentInstance.actions()).not.toContain(UserAction.Promos);
    expect(fixture.nativeElement.textContent).not.toContain(UserAction.Promos.label);
    session.clear(); fixture.detectChanges();
    expect(fixture.componentInstance.actions()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No hay acciones disponibles');
  });
});
