import { CalendarAudience, CalendarLifecycle, CalendarQuery, CalendarViewMode } from '../../domain/commercial-calendar/calendar';

/** The sole URL boundary. Explicit zones are independent of the browser zone. */
export class CalendarUrl {
  private constructor(readonly valid: boolean, readonly view: CalendarViewMode, readonly month: string, readonly zone: string, readonly query: CalendarQuery, private readonly raw: Record<string, string>) {}
  static fromWire(raw: Record<string, unknown>): CalendarUrl {
    const month = typeof raw['month'] === 'string' ? raw['month'] : new Date().toISOString().slice(0, 7);
    const zone = typeof raw['zone'] === 'string' ? raw['zone'] : 'UTC';
    const view = CalendarViewMode.fromWire(raw['view'] ?? CalendarViewMode.Month.wire);
    const lifecycle = raw['lifecycle'] === undefined || raw['lifecycle'] === '' ? undefined : CalendarLifecycle.fromWire(raw['lifecycle']);
    const audience = raw['audience'] === undefined || raw['audience'] === '' ? undefined : CalendarAudience.fromWire(raw['audience']);
    const integer = (value: unknown, fallback: number): number => value === undefined ? fallback : typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : -1;
    const page = integer(raw['page'], 0), size = integer(raw['size'], 25);
    let valid = Object.keys(raw).every(key => ['view', 'month', 'zone', 'lifecycle', 'audience', 'page', 'size'].includes(key)) && Object.values(raw).every(value => typeof value === 'string') && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) >= 1970 && view !== CalendarViewMode.Unknown && lifecycle !== CalendarLifecycle.Unknown && audience !== CalendarAudience.Unknown && page >= 0 && page <= 2147483647 && size >= 1 && size <= 100;
    let from = '', to = '';
    try {
      const [year, number] = month.split('-').map(Number);
      from = this.boundary(year, number - 1, zone); to = this.boundary(number === 12 ? year + 1 : year, number === 12 ? 0 : number, zone);
    } catch { valid = false; }
    const query = { from, to, lifecycle, audience, page, size };
    return new CalendarUrl(valid, view, month, zone, query, { view: view.wire, month, zone, ...(lifecycle ? { lifecycle: lifecycle.wire } : {}), ...(audience ? { audience: audience.wire } : {}), page: String(page), size: String(size) });
  }
  toWire(): Record<string, string> { return { ...this.raw }; }
  private static boundary(year: number, month: number, zone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const target = Date.UTC(year, month, 1);
    const local = (instant: number): number => { const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value])); return Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']), Number(parts['hour']), Number(parts['minute']), Number(parts['second'])); };
    let instant = target;
    for (let count = 0; count < 4; count++) instant += target - local(instant);
    if (local(instant) !== target) throw new Error('Unresolvable month boundary');
    // Inspect nearby zone offsets rather than assuming every DST transition is one hour.
    const offsets = new Set(Array.from({ length: 17 }, (_, index) => { const sample = target + (index - 8) * 21600000; return local(sample) - sample; }));
    const candidates = [...offsets].map(offset => target - offset).filter(candidate => local(candidate) === target);
    if (candidates.length !== 1) throw new Error('Ambiguous month boundary');
    return new Date(instant).toISOString();
  }
}
