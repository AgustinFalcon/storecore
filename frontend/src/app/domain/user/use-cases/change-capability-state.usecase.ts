import { CapabilityStateIntent } from '../capability-state-intent';
import { IUserRepository } from '../user.repository';

export class ChangeCapabilityStateUseCase {
  constructor(private readonly repository: IUserRepository) {}
  execute(intent: CapabilityStateIntent) { return this.repository.changeCapabilityState(intent); }
}
