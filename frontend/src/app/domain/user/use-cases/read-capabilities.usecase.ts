import { Observable } from 'rxjs';
import { CapabilityModule } from '../user.entity';
import { IUserRepository } from '../user.repository';

/** Read-only boundary for the authoritative capability console. */
export class ReadCapabilitiesUseCase {
  constructor(private readonly repository: IUserRepository) {}

  execute(): Observable<readonly CapabilityModule[]> { return this.repository.listCapabilities(); }
}
