import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityChange, CapabilityModule } from '../../domain/user/user.entity';
import { FeatureStatusComponent } from '../../shared/feature-status.component';

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
  readonly states = [
    CapabilityModuleState.Disabled,
    CapabilityModuleState.ReadOnly,
    CapabilityModuleState.Active,
    CapabilityModuleState.Paused,
    CapabilityModuleState.Error,
  ];

  @Output() readonly changeState = new EventEmitter<CapabilityChange>();
  @Output() readonly retry = new EventEmitter<void>();

  emitChange(item: CapabilityModule, state: CapabilityModuleState): void {
    if (!item.module.homologationVisible || !item.state.isCurrent || !state.isCurrent || item.configVersion === null) {
      return;
    }
    this.changeState.emit({ module: item.module, state });
  }
}
