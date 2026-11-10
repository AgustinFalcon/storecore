import { HealthStatus } from './health-status';

/** Framework-free health snapshot for this installation. */
export interface Health {
  readonly status: HealthStatus;
}
