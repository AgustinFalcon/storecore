export {OfferInstant as CampaignInstant,SnapshotOfferClock} from '../offers/offer-clock';
import {OfferInstant} from '../offers/offer-clock';
/** datetime-local is always interpreted in Buenos Aires, independently of browser timezone. */
export class CampaignLocalDate {
 static toWire(local:string):string{return OfferInstant.fromWire(local+':00-03:00').wire;}
 static fromWire(raw:string):string{const instant=OfferInstant.fromWire(raw);if(!instant.known)return '';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant.time!);return parts.replace(' ','T');}
}
