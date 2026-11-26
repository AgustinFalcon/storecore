import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { CalendarHttpRepository } from '../../data/commercial-calendar/calendar-http.repository';
import { CalendarChange, CalendarRepository } from '../../domain/commercial-calendar/calendar';
import { UserRole } from '../../domain/user/user-role';
import { CalendarCommandStore } from './calendar-command.store';
import { CalendarDetailStore } from './calendar-detail.store';
import { CalendarDetailViewComponent } from './calendar-detail.view';
import { CalendarUrl } from './calendar-url';
@Component({selector:'sc-calendar-detail',imports:[CalendarDetailViewComponent],providers:[CalendarDetailStore,CalendarCommandStore,{provide:CalendarRepository,useExisting:CalendarHttpRepository}],changeDetection:ChangeDetectionStrategy.OnPush,template:`<sc-calendar-detail-view [state]="store.vm()" [command]="commands.vm()" [admin]="admin()" [back]="back" [now]="now()" (reload)="reload()" (preflight)="preflight()" (transition)="change($event)" (recover)="commands.recoverCommand()" (audit)="store.loadAudit($event)" (diagnostic)="store.loadDiagnostic()"/>`})
export class CalendarDetailComponent {
readonly store=inject(CalendarDetailStore);readonly commands=inject(CalendarCommandStore);private readonly session=inject(UserSession);private readonly route=inject(ActivatedRoute);readonly admin=()=>this.session.authenticated()&&this.session.roles().includes(UserRole.Admin);readonly now=signal(Date.now());
readonly back=CalendarUrl.fromWire(this.route.snapshot.queryParams).toWire();
constructor(){const destroy=inject(DestroyRef);this.route.paramMap.pipe(takeUntilDestroyed(destroy)).subscribe(params=>{this.commands.clearReview();this.store.load(params.get('eventId')??'');});const timer=setInterval(()=>this.now.set(Date.now()),1000);destroy.onDestroy(()=>clearInterval(timer));effect(()=>{const receipt=this.commands.vm().receipt;untracked(()=>{if(receipt&&receipt.eventId===this.store.vm().id)this.store.load(receipt.eventId);});});}
reload():void{this.commands.clearReview();this.store.load();}preflight():void{const event=this.store.vm().event;if(event)this.commands.preflight(event);}change(change:CalendarChange):void{const event=this.store.vm().event;if(event)this.commands.change(event,change);}
}
