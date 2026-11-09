import { AsyncPipe, CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserSession } from '../../core/auth/user-session';
import { OperatorOverview, OverviewFact, OverviewFactState, OverviewPeriod, OverviewQueue } from '../../domain/overview/overview';
import { UserAction } from './user-action';
import { UserHomeStore } from './user-home.store';

@Component({
  selector: 'sc-user-home',
  imports: [AsyncPipe, CurrencyPipe, FormsModule, RouterLink],
  providers: [UserHomeStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-home.component.html',
  styleUrl: './user-home.component.scss',
})
export class UserHomeComponent implements OnInit {
  readonly periods = OverviewPeriod.selectable;
  readonly actions = computed(() => this.session.authenticated() ? UserAction.forRoles(this.session.roles()) : []);
  constructor(readonly session: UserSession, readonly store: UserHomeStore) {}
  ngOnInit(): void { this.store.load(OverviewPeriod.Today); }
  changePeriod(period: OverviewPeriod): void { if (period !== OverviewPeriod.Unknown) this.store.load(period); }
  factValue(fact: OverviewFact): number | null { return fact.state === OverviewFactState.Known ? fact.value : null; }
  queueAvailable(queue: OverviewQueue<unknown>): boolean { return queue.state === OverviewFactState.Known; }
  instant(value: string, timezone: string): string {
    try { return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value)); }
    catch { return 'Horario no disponible'; }
  }
  range(overview: OperatorOverview): string { return `${this.instant(overview.fromInclusive, overview.timezone)} — ${this.instant(overview.toExclusive, overview.timezone)}`; }
}
