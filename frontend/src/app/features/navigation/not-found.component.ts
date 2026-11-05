import { afterRenderEffect, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NotFoundRecovery } from '../../domain/navigation/surface-identity';
import { SURFACE_TARGET } from './surface-host';

@Component({
  selector: 'sc-not-found',
  imports: [RouterLink],
  template: `<section aria-labelledby="not-found-title">
    <p>Página no disponible</p>
    <h1 #heading id="not-found-title" tabindex="-1">Página no encontrada</h1>
    <p>No encontramos esta página. Podés continuar desde una sección segura.</p>
    <nav aria-label="Recuperar la navegación">
      <a data-cta="not-found-context" [routerLink]="destination()">{{ recovery().label }}</a>
      <a data-cta="not-found-home" [routerLink]="home">Volver al inicio</a>
    </nav>
  </section>`,
  styles: `:host { display: block; padding: clamp(1rem, 4vw, 3rem); } section { max-width: 44rem; margin: auto; } nav { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-top: 2rem; } a { text-decoration: underline; padding-block: .75rem; } h1:focus { outline: 3px solid currentColor; outline-offset: .3rem; }`,
})
export class NotFoundComponent {
  private readonly target = inject(SURFACE_TARGET);
  private readonly router = inject(Router);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private readonly url = toSignal(this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(event => event.urlAfterRedirects)), { initialValue: this.router.url });
  readonly recovery = computed(() => NotFoundRecovery.fromWire(this.router.parseUrl(this.url()).root.children['primary']?.segments[this.target.prefix ? 1 : 0]?.path));
  readonly home = this.target.prefix || '/';
  readonly destination = computed(() => this.target.prefix + this.recovery().path);
  constructor() { afterRenderEffect(() => { this.url(); this.heading().nativeElement.focus(); }); }
}
