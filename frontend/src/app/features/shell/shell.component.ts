import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { ProbeCustomerSessionUseCase } from '../../domain/customer/use-cases/probe-customer-session.usecase';
import { ProbeUserSessionUseCase } from '../../domain/user/use-cases/probe-user-session.usecase';
import { FavoritesMemory } from '../../core/shopper/favorites-memory';
import { ThemeAppearance } from '../../core/theme/theme-appearance';
import { CartStore } from '../cart/cart.store';
import { ShellStore } from './shell.store';

@Component({
  selector: 'sc-shell',
  imports: [AsyncPipe, FormsModule, RouterLink, RouterOutlet],
  providers: [ShellStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private readonly router = inject(Router);
  query = '';
  readonly consoleMode$ = this.router.events.pipe(
    filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    map((event) => event.urlAfterRedirects.startsWith('/user')),
    startWith(this.router.url.startsWith('/user')),
  );

  constructor(
    readonly store: ShellStore,
    readonly cart: CartStore,
    readonly customer: CustomerSession,
    readonly user: UserSession,
    readonly favorites: FavoritesMemory,
    private readonly theme: ThemeAppearance,
    private readonly probeCustomer: ProbeCustomerSessionUseCase,
    private readonly probeUser: ProbeUserSessionUseCase,
  ) {}

  ngOnInit(): void {
    this.theme.apply();
    this.store.loadHealth();
    this.store.loadFacets();
    this.probeCustomer.execute().subscribe({
      next: () => this.cart.load(),
      error: () => undefined,
    });
    this.probeUser.execute().subscribe({ error: () => undefined });
  }

  search(): void {
    const q = this.query.trim();
    void this.router.navigate(['/catalog'], { queryParams: q ? { q } : {} });
  }

  retry(): void {
    this.store.loadHealth();
  }
}
