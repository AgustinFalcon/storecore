import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CHANNEL_REPORT_REPOSITORY } from '../../core/tokens/reporting.tokens';
import { ReportMapper } from '../../data/reporting/report.mapper';
import { reportEnvelopeFixture } from '../../data/reporting/report.spec-fixtures';
import { UserRole } from '../../domain/user/user-role';
import { ReportDashboardComponent } from './report-dashboard.component';

describe('ReportDashboardComponent', () => {
  it('renders valid siblings, explicit unsupported facts and only generic navigation', () => {
    const queryParamMap = new BehaviorSubject(convertToParamMap({ fromDate: '2026-11-01', toDateExclusive: '2026-11-26' }));
    TestBed.configureTestingModule({
      imports: [ReportDashboardComponent],
      providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { queryParamMap } }, {
        provide: CHANNEL_REPORT_REPOSITORY, useValue: { read: () => of(ReportMapper.envelope(reportEnvelopeFixture())) },
      }],
    });
    TestBed.inject(UserSession).commit({ id: 'operator-1', roles: [UserRole.Operator] }, 'csrf');
    const fixture = TestBed.createComponent(ReportDashboardComponent); fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Pedidos creados'); expect(text).toContain('ARS 1234.50');
    expect(text).toContain('Ventas BlackStore'); expect(text).toContain('No modelado');
    expect(text).toContain('operación actual; no conserva este período');
    expect(text).not.toContain('Ver pedidos de este reporte');
  });
});
