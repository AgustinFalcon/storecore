import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, HostListener } from '@angular/core';
import { UserBrandingStore } from './user-branding.store';
import { UserBrandingViewComponent } from './user-branding.view';
@Component({
  selector: 'sc-user-branding', imports: [AsyncPipe, UserBrandingViewComponent], providers: [UserBrandingStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (store.state$ | async; as state) {
    <sc-user-branding-view [state]="state" [dirty]="store.dirty" [valid]="store.valid"
      (draftChange)="store.edit($event)" (publish)="store.publish()" (reload)="reload()" (discard)="discard()" />
  }`,
})
export class UserBrandingComponent {
  constructor(readonly store: UserBrandingStore) { effect(() => { store.syncActor(); store.load(); }); }
  reload(): void {
    if (this.store.dirty && !window.confirm('¿Descartar tu borrador y cargar la apariencia publicada?')) return;
    this.store.load(true);
  }
  discard(): void { if (this.store.dirty && window.confirm('¿Descartar los cambios sin publicar?')) this.store.discard(); }
  canDeactivate(): boolean {
    this.store.syncActor();
    if (this.store.snapshot.phase.busy) return false;
    return !this.store.dirty || window.confirm('Tenés cambios sin publicar. ¿Descartarlos y salir?');
  }
  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty || this.store.snapshot.phase.busy) { event.preventDefault(); event.returnValue = ''; }
  }
}
