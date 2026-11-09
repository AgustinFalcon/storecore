import { Observable } from 'rxjs';
import { OperatorOverview, OverviewPeriod } from './overview';
export interface IOverviewRepository { read(period: OverviewPeriod): Observable<OperatorOverview>; }
