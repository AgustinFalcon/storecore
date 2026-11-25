import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { CalendarHttpRepository } from '../../data/commercial-calendar/calendar-http.repository';
import { CalendarLoadState, CalendarOperation, CalendarRepository } from '../../domain/commercial-calendar/calendar';
import { UserRole } from '../../domain/user/user-role';
import { CalendarCommandStore } from './calendar-command.store';
import { CalendarDetailStore } from './calendar-detail.store';
import { CalendarEditorSubmission, CalendarEditorViewComponent } from './calendar-editor.view';
import { CalendarUrl } from './calendar-url';
@Component({selector:'sc-calendar-editor',imports:[CalendarEditorViewComponent],providers:[CalendarDetailStore,CalendarCommandStore,{provide:CalendarRepository,useExisting:CalendarHttpRepository}],changeDetection:ChangeDetectionStrategy.OnPush,template:`<sc-calendar-editor-view [event]="store.vm().event" [editing]="editing()" [status]="editing()?store.vm().status:ready" [admin]="admin()" [command]="commands.vm()" [back]="back" (save)="save($event)" (recover)="commands.recoverCommand()"/>`})
export class CalendarEditorComponent {
readonly store=inject(CalendarDetailStore);readonly commands=inject(CalendarCommandStore);private readonly route=inject(ActivatedRoute);private readonly session=inject(UserSession);readonly admin=()=>this.session.authenticated()&&this.session.roles().includes(UserRole.Admin);readonly editing=signal(false);readonly ready=CalendarLoadState.Ready;readonly back=CalendarUrl.fromWire(this.route.snapshot.queryParams).toWire();
constructor(){this.route.paramMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(params=>{const id=params.get('eventId');this.editing.set(id!==null);if(id)this.store.load(id);});}
save(value:CalendarEditorSubmission):void{if(!this.admin())return;if(!this.editing()&&value.eventId===null){this.commands.create(value.definition);return;}const event=this.store.vm().event;if(event&&value.eventId===event.id&&value.expectedRevision===event.revision)this.commands.change(event,{operation:CalendarOperation.Edit,expectedRevision:event.revision,reason:value.reason,definition:value.definition});}
}
