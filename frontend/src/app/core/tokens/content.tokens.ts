import { InjectionToken } from '@angular/core';
import { IContentRepository } from '../../domain/content/content.repository';
export const CONTENT_REPOSITORY = new InjectionToken<IContentRepository>('CONTENT_REPOSITORY');
