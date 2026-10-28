import {OfferActivation,OfferSource} from './offer-types';
import type {DemoOffer} from './offer-record';
/** Explicit fictitious cost/floor/margin inputs, never inferred from catalog or merchant data. */
export class SeedPolicyOffersStep {
 execute():DemoOffer[]{const make=(id:string,title:string,sku:string,activation:OfferActivation,discountBps:number,startsAt:string,endsAt:string,cost:number|null=800000,floor:number|null=900000,minMarginBps:number|null=1000):DemoOffer=>({id,title,sku,variant:null,activation,source:OfferSource.Policy,discountBps,priority:10,startsAt,endsAt,cost,floor,minMarginBps,legacy:null,revisionOf:null,replacesRevision:null,revision:0});return[
  make('OFF-DEMO-001','Oferta programada de herramientas','DEMO-001',OfferActivation.Enabled,2000,'2026-10-16T00:00:00-03:00','2026-11-01T00:00:00-03:00'),
  make('OFF-DEMO-002','Borrador pendiente de costos','DEMO-002',OfferActivation.Draft,1500,'2026-10-01T00:00:00-03:00','2026-11-01T00:00:00-03:00',null,null,null),
  make('OFF-DEMO-003','Oferta actual de organización','DEMO-010',OfferActivation.Enabled,1000,'2026-10-01T00:00:00-03:00','2026-11-01T00:00:00-03:00',3000000,6000000,1500),
  make('OFF-DEMO-004','Oferta pausada de atornilladores','DEMO-004',OfferActivation.Paused,500,'2026-10-01T00:00:00-03:00','2026-11-01T00:00:00-03:00',2000000,2500000,1500),
  make('OFF-DEMO-005','Oferta vencida de lijadoras','DEMO-006',OfferActivation.Enabled,500,'2026-10-01T00:00:00-03:00','2026-10-15T00:00:00-03:00'),
  make('OFF-DEMO-006','Oferta con intervalo para corregir','DEMO-003',OfferActivation.Enabled,1000,'2026-10-20T00:00:00-03:00','2026-10-10T00:00:00-03:00'),
 ];}
}
