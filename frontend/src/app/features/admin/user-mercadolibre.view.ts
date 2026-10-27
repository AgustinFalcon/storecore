import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MercadoLibreReadPhase } from './mercadolibre-read-phase';
import { maskMercadoLibreAccountRef, presentMercadoLibreListings } from './user-mercadolibre.presenter';
import { UserMercadoLibreState } from './user-mercadolibre.store';

@Component({
  selector: 'sc-user-mercadolibre-view',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-mercadolibre.view.html',
  styleUrl: './user-mercadolibre.view.scss',
})
export class UserMercadoLibreViewComponent {
  @Input({ required: true }) state!: UserMercadoLibreState;
  @Output() readonly refresh = new EventEmitter<void>();
  @Output() readonly queryChange = new EventEmitter<string>();
  @Output() readonly clearQuery = new EventEmitter<void>();

  get presentation() { return presentMercadoLibreListings(this.state.listings, this.state.query); }
  get maskedAccountRef(): string { return maskMercadoLibreAccountRef(this.state.account?.accountRef ?? ''); }
  get unknownReadPhase(): boolean { return this.state.readPhase === MercadoLibreReadPhase.Unknown; }
}
