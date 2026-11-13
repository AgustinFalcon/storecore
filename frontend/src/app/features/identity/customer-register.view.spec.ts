import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AddressReadState } from '../../domain/customer/address-read-state';
import { CustomerRegistrationStage } from './customer-registration-steps';
import { CustomerRegisterViewComponent } from './customer-register.view';
import { CustomerState } from './customer.store';

const state = (registrationStage: CustomerRegistrationStage, authenticated = false): CustomerState => ({
  loading: false, errorMessage: '', authenticated, email: '', firstName: '', lastName: '', password: '',
  profile: { email: '', firstName: '', lastName: '', phone: '' }, saved: false, profileRevision: 0,
  addresses: [], addressDraft: { id: '', street: '', number: '', city: '', province: '', postalCode: '', isDefault: false },
  addressReadState: AddressReadState.Idle, addressMutationPending: false, registrationStage,
});

describe('CustomerRegisterViewComponent', () => {
  function render(stage: CustomerRegistrationStage, authenticated = false) {
    TestBed.configureTestingModule({ imports: [CustomerRegisterViewComponent], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(CustomerRegisterViewComponent);
    fixture.componentRef.setInput('state', state(stage, authenticated)); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('does not expose continuation while authoritative reconciliation is pending', () => {
    const host = render(CustomerRegistrationStage.ReconcileRequired, true);
    expect(host.textContent).toContain('Falta confirmar la sesión');
    expect(host.querySelector('a[href="/checkout"]')).toBeNull();
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('button')?.textContent).toContain('Reintentar confirmación');
  });

  it('offers continuation only after the closed completion stage', () => {
    const host = render(CustomerRegistrationStage.Complete);
    expect(host.textContent).toContain('Sesión customer activa');
    expect(host.querySelector('form')).toBeNull();
  });

  it.each([CustomerRegistrationStage.Inspecting, CustomerRegistrationStage.Submitting, CustomerRegistrationStage.Reconciling])('shows only status while %s', (stage) => {
    const host = render(stage);
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('a')).toBeNull();
    expect(host.getAttribute('aria-busy')).toBeNull();
    expect(host.textContent).toContain(stage.label);
  });

  it('fails closed when existing-session inspection must be retried', () => {
    const host = render(CustomerRegistrationStage.InspectionRequired);
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('button')?.textContent).toContain('Reintentar comprobación');
  });
});
