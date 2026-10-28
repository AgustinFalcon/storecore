import type {DemoSnapshot} from '../demo-model';
import {AuthorizeCatalogStep,type CatalogAuthority} from '../admin-catalog/catalog-flow';
import {CatalogDetailsRead} from '../rich-catalog/catalog-details';
import {VariantSaleState} from '../catalog/catalog-types';
import {OfferInstant} from './offer-clock';
import {OfferRecordPolicy,type DemoOffer} from './offer-record';
import {EvaluateOfferMarginFloorStep,ResolveOfferReplacementStep,OfferLifecycleStep} from './offer-pricing';
import {OfferActivation,OfferSource,OfferLifecycle,OfferEligibility,OfferIssue,OfferError,OfferCommand,OfferReplacement} from './offer-types';
export const offerFingerprint=(row:DemoOffer)=>JSON.stringify(row);
/** Enabling is evaluated as Enabled, not as the Draft/Paused state displayed before confirmation. */
export class ValidateOfferEnableWindowStep {
 issue(row:DemoOffer,reference:OfferInstant):OfferIssue{const lifecycle=new OfferLifecycleStep().execute({...row,activation:OfferActivation.Enabled},reference);return lifecycle===OfferLifecycle.Expired?OfferIssue.Expired:lifecycle===OfferLifecycle.Invalid?OfferIssue.Interval:lifecycle===OfferLifecycle.Unknown?OfferIssue.Unknown:OfferIssue.None;}
 execute(row:DemoOffer,reference:OfferInstant):void{const issue=this.issue(row,reference);if(issue!==OfferIssue.None)throw new OfferError(issue);}
}
export const offerEnvironmentFingerprint=(snapshot:Pick<DemoSnapshot,'offers'|'offerReference'|'products'|'catalogDetails'>)=>JSON.stringify([snapshot.offerReference,snapshot.offers,snapshot.products,snapshot.catalogDetails]);
export class AuthorizeOffersStep {
 private readonly catalog=new AuthorizeCatalogStep();
 permits(authority:CatalogAuthority,snapshot:DemoSnapshot):boolean{return this.catalog.permits(authority,snapshot);}
 execute(authority:CatalogAuthority,snapshot:DemoSnapshot):void{if(!this.permits(authority,snapshot))throw new OfferError(OfferIssue.Authority);}
}
export class ValidateEditableOfferStep {
 execute(row:DemoOffer):void{if(row.source!==OfferSource.Policy||row.activation!==OfferActivation.Draft)throw new OfferError(row.source===OfferSource.LegacyPreserved?OfferIssue.Legacy:OfferIssue.Unknown);if(!row.title.trim()||row.title.length>120)throw new OfferError(OfferIssue.Title);if(row.discountBps===null||!Number.isSafeInteger(row.discountBps)||row.discountBps<1||row.discountBps>9900)throw new OfferError(OfferIssue.Discount);if(!Number.isSafeInteger(row.priority)||row.priority<0||row.priority>100000)throw new OfferError(OfferIssue.Priority);const start=OfferInstant.fromWire(row.startsAt),end=OfferInstant.fromWire(row.endsAt);if(start.time===null)throw new OfferError(OfferIssue.Interval);if(end.time===null||start.time>=end.time)throw new OfferError(OfferIssue.EndInterval);new OfferRecordPolicy().validate(row);}
}
export class SaveOfferDraftStep {
 private readonly authorize=new AuthorizeOffersStep();private readonly validate=new ValidateEditableOfferStep();private readonly policy=new OfferRecordPolicy();
 execute(snapshot:DemoSnapshot,authority:CatalogAuthority,draft:DemoOffer,editing:string|null,expected:string|null,environment:string):boolean{
  this.authorize.execute(authority,snapshot);if(offerEnvironmentFingerprint(snapshot)!==environment)throw new OfferError(OfferIssue.Conflict);this.validate.execute(draft);if(!snapshot.products.some(product=>product.sku===draft.sku))throw new OfferError(OfferIssue.Scope);
  const original=editing?snapshot.offers.find(row=>row.id===editing):null;if(editing&&(!original||offerFingerprint(original)!==expected||!this.policy.known(original)))throw new OfferError(OfferIssue.Conflict);
  if(original&&original.sku!==draft.sku)throw new OfferError(OfferIssue.Scope);const same=snapshot.offers.find(row=>row.id===draft.id),next=this.policy.clone(draft);
  if(same){if(same!==original||same.activation!==OfferActivation.Draft||same.source!==OfferSource.Policy)throw new OfferError(OfferIssue.Conflict);next.revision=same.revision;if(offerFingerprint(next)===offerFingerprint(same))return false;next.revision++;snapshot.offers=snapshot.offers.map(row=>row===same?next:row);}
  else{if(original){next.revisionOf=original.id;next.replacesRevision=original.revision;}else if(next.revisionOf!==null)throw new OfferError(OfferIssue.Conflict);snapshot.offers.push(next);}
  snapshot.revision++;return true;
 }
}
export class CommitOfferStep {
 private readonly authorize=new AuthorizeOffersStep();private readonly evaluate=new EvaluateOfferMarginFloorStep();private readonly policy=new OfferRecordPolicy();
 execute(snapshot:DemoSnapshot,authority:CatalogAuthority,id:string,command:OfferCommand,expected:string,environment:string):boolean{
  this.authorize.execute(authority,snapshot);const row=snapshot.offers.find(value=>value.id===id);if(!row||command===OfferCommand.Unknown||!this.policy.known(row))throw new OfferError(OfferIssue.Unknown);
  if(row.activation===command.target)return false;if(offerFingerprint(row)!==expected||offerEnvironmentFingerprint(snapshot)!==environment)throw new OfferError(OfferIssue.Conflict);
  if(command===OfferCommand.Pause){if(row.activation!==OfferActivation.Enabled)throw new OfferError(OfferIssue.Unknown);if(new ResolveOfferReplacementStep().execute(row,snapshot)===OfferReplacement.Effective){const original=snapshot.offers.find(value=>value.id===row.revisionOf)!;if(!this.policy.known(original))throw new OfferError(OfferIssue.Unknown);if(original.activation!==OfferActivation.Paused){original.activation=OfferActivation.Paused;original.revision++;}row.revisionOf=null;row.replacesRevision=null;}row.activation=OfferActivation.Paused;row.revision++;snapshot.revision++;return true;}
  if(row.source===OfferSource.LegacyPreserved)throw new OfferError(OfferIssue.Legacy);
  const candidate={...row,activation:OfferActivation.Draft};new ValidateEditableOfferStep().execute(candidate);const variants=CatalogDetailsRead.detail(snapshot,row.sku)?.variants.filter(value=>value.state===VariantSaleState.Active)??[],reference=OfferInstant.fromWire(snapshot.offerReference),evaluations=variants.filter(value=>row.variant===null||row.variant===value.variant).map(value=>this.evaluate.execute(row,snapshot,value.variant,reference));
  new ValidateOfferEnableWindowStep().execute(row,reference);if(!evaluations.some(value=>value.eligibility===OfferEligibility.Evaluated&&value.lifecycle!==OfferLifecycle.Invalid&&value.lifecycle!==OfferLifecycle.Unknown))throw new OfferError(evaluations[0]?.issue??OfferIssue.Scope);
  if(row.revisionOf!==null){const original=snapshot.offers.find(value=>value.id===row.revisionOf);if(!original||original.revision!==row.replacesRevision||!this.policy.known(original))throw new OfferError(OfferIssue.Conflict);if(reference.time!>=OfferInstant.fromWire(row.startsAt).time!){if(original.activation!==OfferActivation.Paused){original.activation=OfferActivation.Paused;original.revision++;}row.revisionOf=null;row.replacesRevision=null;}}
  row.activation=OfferActivation.Enabled;row.revision++;snapshot.revision++;return true;
 }
}
