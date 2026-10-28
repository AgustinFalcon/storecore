import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DemoApplicationState } from '../demo-state';
import { DemoRecoveryFlow } from './demo-recovery-flow';
import { DemoRecoveryPhase } from './demo-recovery-phase';
import { DemoReturnDestination } from './demo-return-destination';

@Component({ selector: 'sc-demo-recovery', imports: [FormsModule, RouterLink], templateUrl: './demo-recovery.component.html', styleUrls: ['../demo.scss', './demo-recovery.component.scss'] })
export class DemoRecoveryComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly state = inject(DemoApplicationState);
  readonly Phase = DemoRecoveryPhase;
  readonly specimens = DemoRecoveryPhase.specimens;
  readonly revision = signal(0);
  readonly flow = new DemoRecoveryFlow({ schedule: callback => { const timer = setTimeout(callback, 250); return () => clearTimeout(timer); } }, () => this.revision.update(value => value + 1));
  get returnQuery(): { returnUrl: string } | null { const raw = this.route.snapshot.queryParamMap.get('returnUrl'); return raw === null ? null : { returnUrl: DemoReturnDestination.fromWire(raw).url }; }
  email = '';
  get phase(): DemoRecoveryPhase { this.revision(); return this.flow.phase; }
  get error(): string { this.revision(); return this.flow.error; }

  constructor() {
    effect(() => { this.state.sessionEpoch(); untracked(() => { this.flow.reset(); this.email = ''; }); });
    inject(DestroyRef).onDestroy(() => this.flow.dispose());
  }
  request(): void { this.flow.request(this.email); }
  simulate(phase: DemoRecoveryPhase): void { this.flow.simulate(phase); }
}
