import { DemoRecoveryFlow, RecoveryScheduler } from './demo-recovery-flow';
import { DemoRecoveryPhase as Phase } from './demo-recovery-phase';

class Scheduler implements RecoveryScheduler {
  readonly callbacks: (() => void)[] = [];
  cancellations = 0;
  schedule(callback: () => void): () => void { this.callbacks.push(callback); return () => this.cancellations++; }
}

describe('SC03 recovery step orchestration', () => {
  it('validates email, coalesces double submit and returns the same neutral result for any email', () => {
    const scheduler = new Scheduler(), flow = new DemoRecoveryFlow(scheduler);
    flow.request('invalid'); expect(flow.phase).toBe(Phase.Request); expect(flow.error).toBeTruthy(); expect(scheduler.callbacks).toHaveLength(0);
    for (const email of ['cliente@demo.invalid', 'absent@arbitrary.invalid']) {
      flow.request(email); expect(flow.phase).toBe(Phase.Submitting);
      const count = scheduler.callbacks.length; flow.request('other@demo.invalid'); expect(scheduler.callbacks).toHaveLength(count); expect(flow.email).toBe(email);
      scheduler.callbacks.at(-1)!(); expect(flow.phase).toBe(Phase.Sent);
    }
  });
  it('keeps the email on service error and retries without stale callbacks replacing completion', () => {
    const scheduler = new Scheduler(), flow = new DemoRecoveryFlow(scheduler);
    flow.request('person@demo.invalid'); const stale = scheduler.callbacks[0];
    flow.simulate(Phase.ServiceError); expect(flow.email).toBe('person@demo.invalid');
    flow.request(flow.email); flow.simulate(Phase.Completed); stale(); scheduler.callbacks[1]();
    expect(flow.phase).toBe(Phase.Completed); expect(scheduler.cancellations).toBe(2);
  });
  it('orders all simulated outcomes and fails closed for an unsupported step result', () => {
    const flow = new DemoRecoveryFlow(new Scheduler());
    for (const phase of Phase.specimens) { flow.simulate(phase); expect(flow.phase).toBe(phase); }
    flow.simulate(Phase.Submitting); expect(flow.phase).toBe(Phase.Unknown);
    flow.request('retry@demo.invalid'); expect(flow.phase).toBe(Phase.Submitting);
  });
  it('cancels on actor reset or disposal even if the scheduler delivers a cancelled callback', () => {
    const scheduler = new Scheduler(), flow = new DemoRecoveryFlow(scheduler);
    flow.request('first@demo.invalid'); flow.reset(); scheduler.callbacks[0](); expect(flow.phase).toBe(Phase.Request); expect(flow.email).toBe('');
    flow.request('second@demo.invalid'); flow.dispose(); scheduler.callbacks[1](); flow.simulate(Phase.Completed); flow.request('later@demo.invalid');
    expect(flow.phase).toBe(Phase.Submitting); expect(scheduler.callbacks).toHaveLength(2);
  });
});
