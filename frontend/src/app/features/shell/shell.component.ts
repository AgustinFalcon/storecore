import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { CustomerSession } from '../../core/auth/customer-session';
import { UserSession } from '../../core/auth/user-session';
import { AccessCoordinator } from '../../core/auth/access-coordinator';
import { AccessContext } from '../../domain/access/access-context';
import { AccessStateKind } from '../../domain/access/session-probe';
import { ReturnDestination } from '../../domain/access/return-destination';
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
    private readonly theme: ThemeAppearance,
    readonly access: AccessCoordinator,
  ) {}

  ngOnInit(): void {
    this.theme.apply();
    this.store.loadHealth();
    this.store.loadFacets();
    this.access.rehydrate().subscribe({
      next: (state) => {
        if (state.permits(AccessContext.Customer)) this.cart.load();
        if (state.kind === AccessStateKind.SelectionRequired && !this.router.url.startsWith('/login')) {
          const path = this.router.url.split(/[?#]/, 1)[0];
          const destination = ReturnDestination.fromPath(path);
          void this.router.navigate(['/login'], {
            queryParams: destination === ReturnDestination.Unknown ? undefined : { returnTo: destination.wire },
          });
        }
        else if (state.activeContext === AccessContext.User && this.router.url === '/') void this.router.navigateByUrl('/user/home');
      },
      error: () => undefined,
    });
  }

  search(): void {
    const q = this.query.trim();
    void this.router.navigate(['/catalog'], { queryParams: q ? { q } : {} });
  }

  retry(): void {
    this.store.loadHealth();
  }
}
