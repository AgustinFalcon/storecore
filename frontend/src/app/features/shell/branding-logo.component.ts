import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { BrandLogo } from '../../domain/branding/merchant-branding';
@Component({
  selector: 'sc-branding-logo', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (logo().url && failedUrl() !== logo().url) { <img [src]="logo().url" [alt]="'Logo de ' + name()" [attr.referrerpolicy]="logo().external ? 'no-referrer' : null" (error)="failedUrl.set(logo().url)" /> }`,
  styles: [':host { display:contents; } img { display:block; width:auto; max-width:120px; height:36px; object-fit:contain; }'],
})
export class BrandingLogoComponent {
  readonly logo = input.required<BrandLogo>(); readonly name = input.required<string>();
  readonly failedUrl = signal<string | null>(null);
}
