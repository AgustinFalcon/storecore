import { InjectionToken } from '@angular/core';
import { ChannelReportRepository } from '../../domain/reporting/report';

export const CHANNEL_REPORT_REPOSITORY = new InjectionToken<ChannelReportRepository>('CHANNEL_REPORT_REPOSITORY');
