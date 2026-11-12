import { InjectionToken } from '@angular/core';
import { IEmailVerificationRepository } from '../../domain/access/email-verification';
export const EMAIL_VERIFICATION_REPOSITORY = new InjectionToken<IEmailVerificationRepository>('EMAIL_VERIFICATION_REPOSITORY');
