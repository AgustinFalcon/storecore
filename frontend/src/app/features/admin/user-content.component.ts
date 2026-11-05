import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, HostListener } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { UserSession } from '../../core/auth/user-session';
import { UserContentViewComponent } from './user-content.view';
import { UserContentStore } from './user-content.store';

@Component({
  selector: 'sc-user-content',
  imports: [AsyncPipe, UserContentViewComponent],
  providers: [UserContentStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.state$ | async; as state) {
      <sc-user-content-view
        [state]="state"
        (homeChange)="store.edit($event)"
        (save)="store.publish()"
        (retry)="store.load()"
        (discard)="discard()"
      />
    }
  `,
})
export class UserContentComponent {
  constructor(readonly store: UserContentStore, private readonly session: UserSession) {
    effect(() => {
      store.setActor(session.authenticated() ? session.principal() : null);
      store.load();
    });
  }

  discard(): void {
    if (this.store.dirty && window.confirm('¿Descartar los cambios sin publicar y restaurar la portada publicada?')) this.store.discard();
  }

  canDeactivate(): boolean {
    this.store.setActor(this.session.authenticated() ? this.session.principal() : null);
    if (this.store.snapshot.phase === HomeContentPhase.Saving) return false;
    if (!this.store.dirty) return true;
    if (!window.confirm('Tenés cambios sin publicar. ¿Descartarlos y salir?')) return false;
    this.store.discard();
    return true;
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty || this.store.snapshot.phase === HomeContentPhase.Saving) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}

export const userContentLeaveGuard: CanDeactivateFn<UserContentComponent> = (component) => component.canDeactivate();
