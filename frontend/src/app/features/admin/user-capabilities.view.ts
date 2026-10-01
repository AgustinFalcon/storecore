import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';
import { CapabilityModule, CapabilityState } from '../../domain/user/user.entity';
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

  @Output() readonly changeState = new EventEmitter<{ module: string; state: CapabilityState }>();
  @Output() readonly retry = new EventEmitter<void>();

  moduleOf(module: string): CapabilityModuleId {
    return CapabilityModuleId.fromWire(module);
  }

  stateOf(state: string): CapabilityModuleState {
    return CapabilityModuleState.fromWire(state);
  }

  emitChange(module: string, state: CapabilityModuleState): void {
    if (state === CapabilityModuleState.Unknown) {
      return;
    }
    this.changeState.emit({ module, state: state.wire as CapabilityState });
  }
}
