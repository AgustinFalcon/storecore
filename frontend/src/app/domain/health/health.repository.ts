import { Observable } from 'rxjs';
import { Health } from './health.entity';

/**
 * Puerto de salida. El dominio no conoce HTTP.
 * La implementación concreta vive en data/ y se inyecta con HEALTH_REPOSITORY.
 */
export interface IHealthRepository {
  read(): Observable<Health>;
}
