import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RecoveryRealm } from '../../domain/access/recovery';
import { EmailOwnershipComponent } from './email-ownership.component';

@Component({ selector: 'sc-user-account', imports: [EmailOwnershipComponent], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="sc-page sc-auth" aria-labelledby="account-title"><div class="sc-auth__card"><header class="sc-page-head"><p class="sc-kicker">Cuenta de administración</p><h1 id="account-title">Mi cuenta</h1><p>Configuración de acceso de tu cuenta USER.</p></header><sc-email-ownership [realm]="realm" /></div></section>` })
export class UserAccountComponent { readonly realm = RecoveryRealm.User; }
