import { HttpErrorResponse } from '@angular/common/http';
import { effect, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { takeUntil } from 'rxjs';
import { UserSession } from '../../core/auth/user-session';
import { CalendarEvent, CalendarLoadState, CalendarPage, CalendarReceipt, CalendarReminderSwitch, CalendarRepository, CalendarUseCases, CalendarUuid } from '../../domain/commercial-calendar/calendar';
import { UserRole } from '../../domain/user/user-role';
export interface CalendarDetailState { readonly id:string; readonly event:CalendarEvent|null; readonly status:CalendarLoadState; readonly audit:CalendarPage<CalendarReceipt>|null; readonly auditStatus:CalendarLoadState; readonly auditPage:number; readonly diagnostic:CalendarReminderSwitch|null; readonly diagnosticStatus:CalendarLoadState; }
@Injectable()
export class CalendarDetailStore extends ComponentStore<CalendarDetailState> {
  readonly vm = this.selectSignal(state => state); private readonly cases:CalendarUseCases; private identity=''; private request=0; private auditRequest=0; private switchRequest=0;
  constructor(repository:CalendarRepository, private readonly session:UserSession) {
    super({ id:'', event:null, status:CalendarLoadState.Loading, audit:null, auditStatus:CalendarLoadState.Empty, auditPage:0, diagnostic:null, diagnosticStatus:CalendarLoadState.Empty }); this.cases=new CalendarUseCases(repository);
    effect(() => { const identity=this.actor(); if (identity===this.identity) return; this.identity=identity; this.request++; this.auditRequest++; this.switchRequest++; this.patchState({event:null,audit:null,diagnostic:null,auditStatus:CalendarLoadState.Empty,diagnosticStatus:CalendarLoadState.Empty}); if(this.get().id) this.load(); });
  }
  private actor():string { return `${this.session.authenticationEpoch()}:${this.session.authenticated()}:${this.session.principal()?.id}:${this.session.roles().map(role=>role.wire).join(',')}`; }
  private allowed():boolean { return this.session.authenticated() && UserRole.hasKnownRole(this.session.roles()); }
  private admin():boolean { return this.allowed() && this.identity===this.actor() && this.session.roles().includes(UserRole.Admin); }
  private failure(error:unknown, previous:boolean):CalendarLoadState { return error instanceof HttpErrorResponse && [401,403].includes(error.status) ? CalendarLoadState.Denied : error instanceof HttpErrorResponse && error.status===404 ? CalendarLoadState.Unavailable : previous ? CalendarLoadState.Stale : error instanceof HttpErrorResponse ? CalendarLoadState.Error : CalendarLoadState.Corrupt; }
  load(id=this.get().id):void {
    const request=++this.request, identity=this.identity, changed=id!==this.get().id;
    if(changed) { this.auditRequest++; this.patchState({audit:null,auditStatus:CalendarLoadState.Empty,auditPage:0}); }
    if(!this.allowed()) { this.patchState({id,event:null,status:CalendarLoadState.Denied}); return; }
    if(!CalendarUuid.fromWire(id)) { this.patchState({id,event:null,status:CalendarLoadState.Invalid}); return; }
    const previous=changed?null:this.get().event;
    this.patchState({id,event:previous,status:previous?CalendarLoadState.Refreshing:CalendarLoadState.Loading,...(changed?{audit:null,auditStatus:CalendarLoadState.Empty,auditPage:0}: {})});
    if(changed) this.auditRequest++;
    this.cases.detail(id).pipe(takeUntil(this.destroy$)).subscribe({next:event=>{if(request===this.request&&identity===this.actor())this.patchState({event,status:CalendarLoadState.Ready});},error:error=>{if(request!==this.request||identity!==this.actor())return;const status=this.failure(error,!!previous);this.patchState({status,event:status===CalendarLoadState.Stale?previous:null});}});
  }
  loadAudit(page=0):void {
    if(!this.admin()||!CalendarUuid.fromWire(this.get().id)||page<0||!Number.isSafeInteger(page))return;
    const request=++this.auditRequest, identity=this.identity,id=this.get().id,previous=page===this.get().auditPage?this.get().audit:null;
    this.patchState({auditPage:page,audit:previous,auditStatus:previous?CalendarLoadState.Refreshing:CalendarLoadState.Loading});
    this.cases.audit(id,page,25).pipe(takeUntil(this.destroy$)).subscribe({next:audit=>{if(request===this.auditRequest&&identity===this.actor()&&id===this.get().id)this.patchState({audit,auditStatus:audit.items.length?CalendarLoadState.Ready:CalendarLoadState.Empty});},error:error=>{if(request===this.auditRequest&&identity===this.actor()){const status=this.failure(error,!!previous);this.patchState({auditStatus:status,audit:status===CalendarLoadState.Stale?previous:null});}}});
  }
  loadDiagnostic():void {
    if(!this.admin())return;const request=++this.switchRequest,identity=this.identity;this.patchState({diagnosticStatus:CalendarLoadState.Loading});
    this.cases.reminderSwitch().pipe(takeUntil(this.destroy$)).subscribe({next:diagnostic=>{if(request===this.switchRequest&&identity===this.actor())this.patchState({diagnostic,diagnosticStatus:CalendarLoadState.Ready});},error:error=>{if(request===this.switchRequest&&identity===this.actor())this.patchState({diagnostic:null,diagnosticStatus:this.failure(error,false)});}});
  }
}
