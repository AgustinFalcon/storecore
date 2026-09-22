import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'sc-feature-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feature-status.component.html',
})
export class FeatureStatusComponent {
  @Input() loading = false;
  @Input() error = '';
  @Input() empty = false;
  @Input() loadingText = 'Cargando…';
  @Input() emptyText = 'No hay datos en esta instalación.';
}
