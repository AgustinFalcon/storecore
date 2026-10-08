import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild, afterNextRender, Injector, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IdentityRealm, LoginStage } from '../../domain/access/access.types';
import { AccessState } from './access.store';

@Component({
  selector: 'sc-access-view',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sc-auth" aria-labelledby="access-title" [attr.aria-busy]="state.stage.busy">
      <div class="sc-auth__card">
        <h1 id="access-title">Ingresar a StoreCore</h1>
        <h2 #heading tabindex="-1">{{ state.stage.label }}</h2>
        @if (state.stage.message || state.validationMessage) {
          <p role="alert">{{ state.validationMessage || state.stage.message }}</p>
        }
        @if (state.stage.busy) { <p role="status" aria-live="polite">{{ state.stage.label }}…</p> }
        @if (state.stage.collecting) {
          <form class="sc-auth__form" (ngSubmit)="submitCredentials.emit()">
            <label for="access-email">Email</label>
            <input #email id="access-email" name="email" type="email" autocomplete="username" required maxlength="320"
              [disabled]="state.stage.busy" [ngModel]="state.email" (ngModelChange)="emailChange.emit($event)" />
            <label for="access-password">Contraseña</label>
            <input id="access-password" name="password" type="password" autocomplete="current-password" required aria-describedby="access-password-requirements"
              [disabled]="state.stage.busy" [ngModel]="state.password" (ngModelChange)="passwordChange.emit($event)" />
            <small id="access-password-requirements">Entre 12 y 128 caracteres.</small>
            <button class="sc-btn sc-btn--primary" type="submit" [disabled]="state.stage.busy">Ingresar</button>
          </form>
        } @else if (state.stage === stages.SelectContext || state.stage === stages.IssueSession) {
          <p>Las credenciales verificadas permiten estos contextos. Elegí uno para continuar.</p>
          <div class="sc-auth__form" role="group" aria-label="Contextos verificados">
            @for (context of state.resolution.contexts; track context) {
              <button class="sc-btn sc-btn--primary" type="button" [disabled]="state.stage.busy" (click)="selectContext.emit(context)">{{ context.label }}</button>
            }
            <button class="sc-btn sc-btn--ghost" type="button" [disabled]="state.stage.busy" (click)="restart.emit()">Volver a ingresar</button>
          </div>
        }
      </div>
    </section>
  `,
})
export class AccessViewComponent implements OnChanges {
  @Input({ required: true }) state!: AccessState;
  @Output() readonly emailChange = new EventEmitter<string>();
  @Output() readonly passwordChange = new EventEmitter<string>();
  @Output() readonly submitCredentials = new EventEmitter<void>();
  @Output() readonly selectContext = new EventEmitter<IdentityRealm>();
  @Output() readonly restart = new EventEmitter<void>();
  @ViewChild('heading') private heading?: ElementRef<HTMLElement>;
  readonly stages = LoginStage;
  private readonly injector = inject(Injector);
  private previousStage?: LoginStage;
  private previousValidation = '';
  ngOnChanges(): void {
    if ((this.previousStage !== this.state.stage && !this.state.stage.busy) || this.previousValidation !== this.state.validationMessage) {
      afterNextRender(() => this.heading?.nativeElement.focus(), { injector: this.injector });
    }
    this.previousStage = this.state.stage;
    this.previousValidation = this.state.validationMessage;
  }
}
