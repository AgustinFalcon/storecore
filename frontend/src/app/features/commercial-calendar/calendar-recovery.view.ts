import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { CalendarRecoveryState } from '../../domain/commercial-calendar/calendar';
import { CalendarCommandState } from './calendar-command.store';
@Component({selector:'sc-calendar-recovery',styleUrl:'./calendar.css',changeDetection:ChangeDetectionStrategy.OnPush,template:`<div role="status" aria-live="polite">{{state().message}}</div>@if(state().recovery.status !== clear){<section class="notice" aria-label="Recuperación de comando"><h2>{{state().recovery.status.label}}</h2><p>Las nuevas acciones quedan bloqueadas hasta resolver el comando original.</p>@if(state().recovery.pending;as pending){<p>Comando {{pending.commandId}}</p><button type="button" (click)="recover.emit()" [disabled]="state().busy">Recuperar mismo comando</button>}@else{<p>No se puede validar el registro de recuperación. Conservá esta sesión y solicitá asistencia.</p>}</section>}`})
export class CalendarRecoveryViewComponent { readonly state=input.required<CalendarCommandState>(); readonly recover=output<void>(); readonly clear=CalendarRecoveryState.Clear; }
