import { CapabilityCommandJournal } from './capability-command.journal';
import { CapabilityStateIntent } from '../../domain/user/capability-state-intent';
import { CapabilityModuleId } from '../../domain/user/capability-module-id';
import { CapabilityModuleState } from '../../domain/user/capability-module-state';

const intent = () => CapabilityStateIntent.create({ id: CapabilityModuleId.Catalog, state: CapabilityModuleState.Disabled, configVersion: 2 },
  CapabilityModuleState.Active, 'motivo', () => '10000000-0000-4000-8000-000000000001')!;
describe('CapabilityCommandJournal', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('releases only the matching epoch/correlation and preserves a newer epoch command', () => {
    const journal = new CapabilityCommandJournal(); const first = intent(); expect(journal.begin('old', first)).toBe(true);
    expect(journal.recover('new').locked).toBe(false); expect(journal.begin('new', first)).toBe(true);
    journal.release('old', first); expect(journal.recover('new').locked).toBe(true);
    journal.release('new', first); expect(journal.recover('new').locked).toBe(false);
  });
  it('preserves the fence for malformed persisted intents and drops it for a fresh epoch', () => {
    sessionStorage.setItem('storecore.capability-command.v1', JSON.stringify({ version: 1, epoch: 'old', intent: { module: 'FUTURE' } }));
    const journal = new CapabilityCommandJournal(); expect(journal.recover('old')).toEqual({ locked: true, intent: null });
    expect(journal.begin('old', intent())).toBe(false); expect(journal.recover('new').locked).toBe(false);
  });
  it('normalizes unparseable storage into a same-epoch fail-closed marker', () => {
    sessionStorage.setItem('storecore.capability-command.v1', '{broken');
    const journal = new CapabilityCommandJournal();
    expect(journal.recover('current')).toEqual({ locked: true, intent: null });
    expect(JSON.parse(sessionStorage.getItem('storecore.capability-command.v1')!).epoch).toBe('current');
    expect(journal.recover('next').locked).toBe(false);
  });
  it('fails closed if durable session storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(new CapabilityCommandJournal().begin('epoch', intent())).toBe(false);
  });
});
