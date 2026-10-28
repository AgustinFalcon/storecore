export class OrderDatePrecision {
  private constructor(readonly label: string) {}
  static readonly Day = new OrderDatePrecision('Día registrado');
  static readonly Instant = new OrderDatePrecision('Hora de Buenos Aires');
  static readonly Unknown = new OrderDatePrecision('Fecha no disponible');
}

/** Single date boundary: never parse IDs, human history, or permissive Date.parse input. */
export class DemoOrderDate {
  private constructor(readonly precision: OrderDatePrecision, readonly time: number | null, readonly label: string, private readonly civilDay: number | null = null) {}
  /** Civil BA day descending; date-only records precede timed records on that day (unknown hour, not midnight). */
  compareNewest(other: DemoOrderDate): number {
    if (this.civilDay === null) return other.civilDay === null ? 0 : 1;
    if (other.civilDay === null) return -1;
    const day = other.civilDay-this.civilDay;
    if (day) return day;
    if (this.precision !== other.precision) return this.precision === OrderDatePrecision.Day ? -1 : 1;
    return this.precision === OrderDatePrecision.Instant ? (other.time ?? 0)-(this.time ?? 0) : 0;
  }
  isNotAfter(other:DemoOrderDate):boolean|null {if(this.civilDay===null||other.civilDay===null)return null;if(this.precision===OrderDatePrecision.Instant&&other.precision===OrderDatePrecision.Instant)return (this.time??0)<=(other.time??0);return this.civilDay<=other.civilDay;}
  static fromWire(raw: unknown): DemoOrderDate {
    const unknown = () => new DemoOrderDate(OrderDatePrecision.Unknown, null, OrderDatePrecision.Unknown.label);
    if (typeof raw !== 'string') return unknown();
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    const instant = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
    const parts = day ?? instant;
    if (!parts) return unknown();
    const year = Number(parts[1]), month = Number(parts[2]), date = Number(parts[3]);
    const calendar = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
    if (year < 1 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth()+1 !== month || calendar.getUTCDate() !== date) return unknown();
    if (day) return new DemoOrderDate(OrderDatePrecision.Day, null, `${parts[3]}/${parts[2]}/${parts[1]}`, year*10000+month*100+date);
    if (!instant || Number(instant[4]) > 23 || Number(instant[5]) > 59 || Number(instant[6]) > 59) return unknown();
    const zone = instant[7];
    if (zone !== 'Z' && (Number(zone.slice(1,3)) > 23 || Number(zone.slice(4,6)) > 59)) return unknown();
    const time = Date.parse(raw);
    if (!Number.isFinite(time)) return unknown();
    const civil = new Intl.DateTimeFormat('en', { timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(time);
    const key = Number(civil.find(part=>part.type==='year')?.value)*10000+Number(civil.find(part=>part.type==='month')?.value)*100+Number(civil.find(part=>part.type==='day')?.value);
    return new DemoOrderDate(OrderDatePrecision.Instant, time, new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(time)+' (Buenos Aires)',key);
  }
}
