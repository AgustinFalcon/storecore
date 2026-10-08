import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccessContext } from '../../domain/access/access-context';
import { LoginStage } from '../../domain/access/login-stage';
import type { LoginViewState } from './login.store';

@Component({
  selector: 'sc-login-view',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.view.html',
})
export class LoginViewComponent implements AfterViewChecked {
  @Input({ required: true }) state!: LoginViewState;
  @Output() emailChange = new EventEmitter<string>();
  @Output() passwordChange = new EventEmitter<string>();
  @Output() submitCredentials = new EventEmitter<void>();
  @Output() selectContext = new EventEmitter<AccessContext>();
  readonly stages = LoginStage;
  @ViewChild('selectionHeading') private selectionHeading?: ElementRef<HTMLHeadingElement>;
  private previousStage = LoginStage.Unknown;
  ngAfterViewChecked(): void {
    if (this.state.stage !== this.previousStage && this.state.stage === LoginStage.SelectContext) this.selectionHeading?.nativeElement.focus();
    this.previousStage = this.state.stage;
  }
}
