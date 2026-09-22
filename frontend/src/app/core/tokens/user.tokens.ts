import { InjectionToken } from '@angular/core';
import { IUserRepository } from '../../domain/user/user.repository';

export const USER_REPOSITORY = new InjectionToken<IUserRepository>('IUserRepository');
