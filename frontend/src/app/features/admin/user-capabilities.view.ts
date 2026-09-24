import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CapabilityModule, CapabilityState } from '../../domain/user/user.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

const STATES: readonly CapabilityState[] = ['DISABLED', 'READ_ONLY', 'ACTIVE', 'PAUSED', 'ERROR'];

@Component({
  selector: 'sc-user-capabilities-view',
  imports: [FeatureStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-capabilities.view.html',
})
export class UserCapabilitiesViewComponent {
  @Input() items: readonly CapabilityModule[] = [];
  @Input() loading = false;
  @Input() error = '';
  readonly states = STATES;

  @Output() readonly changeState = new EventEmitter<{ module: string; state: CapabilityState }>();
  @Output() readonly retry = new EventEmitter<void>();
}
