import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CustomerSession } from '../../core/auth/customer-session';
import { SignOutCustomerUseCase } from '../../domain/customer/use-cases/sign-out-customer.usecase';

@Component({
  selector: 'sc-customer-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-layout.component.html',
})
export class CustomerLayoutComponent {
  constructor(
    readonly session: CustomerSession,
    private readonly signOutCustomer: SignOutCustomerUseCase,
    private readonly router: Router,
  ) {}

  signOut(): void {
    this.signOutCustomer.execute().subscribe({
      next: () => void this.router.navigateByUrl('/customer/session'),
      error: () => void this.router.navigateByUrl('/customer/session'),
    });
  }
}
