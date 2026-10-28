import {DemoOrderDate,OrderDatePrecision} from '../orders/demo-order-date';
export const DEMO_OFFER_REFERENCE='2026-10-15T12:00:00-03:00';
export class OfferInstant {
 private constructor(readonly wire:string,readonly time:number|null,readonly label:string){}
 static readonly Unknown=new OfferInstant('',null,'Fecha no disponible');
 static fromWire(raw:unknown):OfferInstant{const date=DemoOrderDate.fromWire(raw);return typeof raw==='string'&&date.precision===OrderDatePrecision.Instant&&date.time!==null?new OfferInstant(raw,date.time,date.label):this.Unknown;}
 get known(){return this.time!==null;}
 get civilDay():string{return this.time===null?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(this.time);}
}
export interface OfferClockPort {capture():OfferInstant;}
/** A persisted simulation instant, not wall time; reload never recaptures Date.now. */
export class SnapshotOfferClock implements OfferClockPort {
 constructor(private readonly reference:()=>string){}
 capture():OfferInstant{return OfferInstant.fromWire(this.reference());}
}
export class LegacyOfferIntervalStep {
 execute(from:string,until:string):{start:OfferInstant;end:OfferInstant}{const startDay=DemoOrderDate.fromWire(from),endDay=DemoOrderDate.fromWire(until);if(startDay.precision!==OrderDatePrecision.Day||endDay.precision!==OrderDatePrecision.Day)return{start:OfferInstant.Unknown,end:OfferInstant.Unknown};const end=OfferInstant.fromWire(until+'T00:00:00-03:00');if(end.time===null)return{start:OfferInstant.Unknown,end:OfferInstant.Unknown};return{start:OfferInstant.fromWire(from+'T00:00:00-03:00'),end:OfferInstant.fromWire(new Date(end.time+86400000).toISOString())};}
}
