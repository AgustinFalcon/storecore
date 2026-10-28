import { DemoRecoveryPhase as Phase } from './demo-recovery-phase';

export interface RecoveryScheduler { schedule(callback: () => void): () => void; }

export class RequestRecoveryStep {
  accepts(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()); }
  start(): Phase { return Phase.Submitting; }
  complete(): Phase { return Phase.Sent; }
}

export class SimulateRecoveryStep {
  complete(phase: Phase): Phase { return Phase.specimens.some(value => value === phase) ? phase : Phase.Unknown; }
}

/** Orders the steps; it cannot reach accounts, storage, HTTP or authentication. */
export class DemoRecoveryFlow {
  private readonly requestStep = new RequestRecoveryStep();
  private readonly simulateStep = new SimulateRecoveryStep();
  private cancelScheduled: (() => void) | undefined;
  private generation = 0;
  private disposed = false;
  phase = Phase.Request;
  email = '';
  error = '';

  constructor(private readonly scheduler: RecoveryScheduler, private readonly changed: () => void = () => undefined) {}

  request(email: string): void {
    if (this.disposed || !this.phase.canRequest) return;
    this.email = email;
    if (!this.requestStep.accepts(email)) { this.error = 'Ingresá un email válido.'; this.changed(); return; }
    this.cancel();
    this.error = '';
    this.phase = this.requestStep.start();
    const generation = this.generation;
    this.cancelScheduled = this.scheduler.schedule(() => {
      if (this.disposed || generation !== this.generation) return;
      this.cancelScheduled = undefined;
      this.phase = this.requestStep.complete();
      this.changed();
    });
    this.changed();
  }

  simulate(phase: Phase): void {
    if (this.disposed) return;
    this.cancel(); this.error = ''; this.phase = this.simulateStep.complete(phase); this.changed();
  }

  reset(): void {
    if (this.disposed) return;
    this.cancel(); this.email = ''; this.error = ''; this.phase = Phase.Request; this.changed();
  }

  dispose(): void { this.cancel(); this.disposed = true; }
  private cancel(): void { this.generation++; this.cancelScheduled?.(); this.cancelScheduled = undefined; }
}
