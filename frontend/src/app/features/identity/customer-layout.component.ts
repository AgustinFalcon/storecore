import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CustomerSession } from '../../core/auth/customer-session';

@Component({
  selector: 'sc-customer-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './customer-layout.component.html',
})
export class CustomerLayoutComponent {
  constructor(readonly session: CustomerSession) {}
}
