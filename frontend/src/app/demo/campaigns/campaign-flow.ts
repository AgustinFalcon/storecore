import {UserRole} from '../../domain/user/user-role';
import {DemoContext,DemoModuleId,type DemoSnapshot} from '../demo-model';
import type {CatalogAuthority} from '../admin-catalog/catalog-flow';
import {CatalogDetailsRead,CatalogDetailsPolicy} from '../rich-catalog/catalog-details';
import {QuoteOffersStep,EvaluateOfferMarginFloorStep} from '../offers/offer-pricing';
import {DemoProductSelection} from '../catalog/demo-product-selection';
import {OfferLifecycle} from '../offers/offer-types';
import {CampaignInstant,SnapshotOfferClock} from './campaign-clock';
import {CampaignRecordPolicy,CampaignRecordCodec,type DemoCampaignRecord} from './campaign-record';
import {CampaignActivation,CampaignApproval,CampaignRevisionStatus,CampaignTemporalValidity,CampaignLifecycle,CampaignIssue,CampaignError,CampaignCommand,CampaignPurchaseEligibility} from './campaign-types';
export const campaignFingerprint=(row:DemoCampaignRecord)=>JSON.stringify(row);
export const campaignEnvironmentFingerprint=(snapshot:DemoSnapshot)=>JSON.stringify([snapshot.campaignRecords,snapshot.products,snapshot.catalogDetails,snapshot.offers,snapshot.offerReference,snapshot.modules]);
export class AuthorizeCampaignsStep {
 permits(authority:CatalogAuthority,snapshot:DemoSnapshot):boolean{if(!authority.readable||authority.context!==DemoContext.Admin||authority.role!==UserRole.Admin||!authority.actor||authority.actor!==authority.expectedActor||authority.epoch!==authority.expectedEpoch)return false;const modules=snapshot.modules.filter(row=>row.id===DemoModuleId.Catalog);return modules.length===1&&modules[0].enabled===true;}
 execute(authority:CatalogAuthority,snapshot:DemoSnapshot):void{if(!this.permits(authority,snapshot))throw new CampaignError(CampaignIssue.Authority);}
}
export class DecodeCampaignRecordStep {execute(raw:unknown){return CampaignRecordCodec.fromWire(raw);}}
export class ValidateCampaignScopeStep {execute(snapshot:DemoSnapshot,row:DemoCampaignRecord):void{if(!row.skus.length||row.skus.some(sku=>!snapshot.products.some(product=>product.sku===sku)||!CatalogDetailsRead.detail(snapshot,sku)||!CatalogDetailsPolicy.known(CatalogDetailsRead.detail(snapshot,sku)!)))throw new CampaignError(CampaignIssue.Scope);}}
export class ValidateCampaignIntervalStep {
 execute(row:DemoCampaignRecord):CampaignTemporalValidity{const start=CampaignInstant.fromWire(row.startsAt),end=CampaignInstant.fromWire(row.endsAt);return !start.known||!end.known?CampaignTemporalValidity.Unknown:start.time!>=end.time!?CampaignTemporalValidity.Invalid:CampaignTemporalValidity.Valid;}
}
export class ProjectCampaignLifecycleStep {
 execute(row:DemoCampaignRecord,reference:CampaignInstant):CampaignLifecycle{if(!new CampaignRecordPolicy().known(row)||!reference.known||new ValidateCampaignIntervalStep().execute(row)!==CampaignTemporalValidity.Valid)return CampaignLifecycle.Unknown;if(row.activation===CampaignActivation.Paused)return CampaignLifecycle.Paused;return reference.time!<CampaignInstant.fromWire(row.startsAt).time!?CampaignLifecycle.Scheduled:reference.time!>=CampaignInstant.fromWire(row.endsAt).time!?CampaignLifecycle.Expired:CampaignLifecycle.Current;}
}
export class ValidateCampaignApprovalStep {
 execute(snapshot:DemoSnapshot,row:DemoCampaignRecord,reference:CampaignInstant):void{new CampaignRecordPolicy().validate(row);if(!new CampaignRecordPolicy().known(row))throw new CampaignError(CampaignIssue.Shape);if(!row.title.trim())throw new CampaignError(CampaignIssue.Title);new ValidateCampaignScopeStep().execute(snapshot,row);if(new ValidateCampaignIntervalStep().execute(row)!==CampaignTemporalValidity.Valid||!reference.known)throw new CampaignError(CampaignIssue.Interval);if(reference.time!>=CampaignInstant.fromWire(row.endsAt).time!)throw new CampaignError(CampaignIssue.Expired);if(row.declaredMarginBps===null)throw new CampaignError(CampaignIssue.Margin);}
}
export class ProjectCampaignPreviewStep {
 execute(snapshot:DemoSnapshot,row:DemoCampaignRecord){return row.skus.flatMap(sku=>{const product=snapshot.products.find(value=>value.sku===sku);return product?(CatalogDetailsRead.detail(snapshot,sku)?.variants??[]).map(value=>{const available=CatalogDetailsRead.available(snapshot,product,value.variant),current=new QuoteOffersStep().execute(snapshot,product,value.variant);return{sku,variant:value.variant,selection:DemoProductSelection.forVariant(value.variant),base:value.price,available,eligibility:CampaignPurchaseEligibility.project(available,current.unit),future:snapshot.offers.filter(offer=>offer.sku===sku).map(offer=>new EvaluateOfferMarginFloorStep().execute(offer,snapshot,value.variant,CampaignInstant.fromWire(snapshot.offerReference))).filter(evaluation=>evaluation.lifecycle===OfferLifecycle.Scheduled),current};}):[];});}
}
/** Commands operate on an isolated candidate inside the existing state.run transaction. */
export class SaveCampaignDraftStep {
 execute(snapshot:DemoSnapshot,authority:CatalogAuthority,draft:DemoCampaignRecord,expected:string|null,environment:string):boolean{
  new AuthorizeCampaignsStep().execute(authority,snapshot);const policy=new CampaignRecordPolicy();policy.validate(draft);if(!policy.known(draft)||draft.approval!==CampaignApproval.Draft||draft.revisionStatus!==CampaignRevisionStatus.Candidate)throw new CampaignError(CampaignIssue.Shape);
  const same=snapshot.campaignRecords.find(row=>row.id===draft.id);if(same&&(!policy.editable(same)||same.revisionStatus!==CampaignRevisionStatus.Candidate))throw new CampaignError(CampaignIssue.Conflict);if(same&&campaignFingerprint(same)===campaignFingerprint(draft))return false;
  if(campaignEnvironmentFingerprint(snapshot)!==environment)throw new CampaignError(CampaignIssue.Conflict);
  if(same&&(!expected||campaignFingerprint(same)!==expected))throw new CampaignError(CampaignIssue.Conflict);
  const next=snapshot.campaignRecords.map(row=>policy.clone(row));if(same)next.splice(next.findIndex(row=>row.id===draft.id),1,policy.clone(draft));else next.push(policy.clone(draft));policy.validateHistory(next);snapshot.campaignRecords=next;snapshot.revision++;return true;
 }
}
export class ApproveCampaignRevisionStep {
 execute(snapshot:DemoSnapshot,authority:CatalogAuthority,id:string,expected:string,environment:string):boolean{
  new AuthorizeCampaignsStep().execute(authority,snapshot);const row=snapshot.campaignRecords.find(value=>value.id===id);if(!row)throw new CampaignError(CampaignIssue.Conflict);
  if(row.revisionStatus===CampaignRevisionStatus.Current&&row.approval===CampaignApproval.Approved&&row.approvalMetadata?.actorId===authority.actor){const previous={...row,revisionStatus:CampaignRevisionStatus.Candidate,approval:CampaignApproval.Draft,approvalMetadata:null};if(campaignFingerprint(previous)===expected)return false;throw new CampaignError(CampaignIssue.Conflict);}
  if(row.revisionStatus!==CampaignRevisionStatus.Candidate||campaignFingerprint(row)!==expected||campaignEnvironmentFingerprint(snapshot)!==environment)throw new CampaignError(CampaignIssue.Conflict);
  const reference=new SnapshotOfferClock(()=>snapshot.offerReference).capture();new ValidateCampaignApprovalStep().execute(snapshot,row,reference);
  const next=snapshot.campaignRecords.map(value=>new CampaignRecordPolicy().clone(value)),candidate=next.find(value=>value.id===id)!;
  const prior=next.find(value=>value.familyId===candidate.familyId&&value.revisionStatus===CampaignRevisionStatus.Current);
  if((prior?.id??null)!==candidate.revisesId)throw new CampaignError(CampaignIssue.Conflict);
  if(prior&&(!new CampaignRecordPolicy().known(prior)||next.some(value=>value.id!==candidate.id&&value.revisesId===prior.id&&value.revisionStatus===CampaignRevisionStatus.Candidate&&!new CampaignRecordPolicy().known(value))))throw new CampaignError(CampaignIssue.Shape);
  if(prior){prior.revisionStatus=CampaignRevisionStatus.Superseded;for(const sibling of next)if(sibling.id!==candidate.id&&sibling.revisionStatus===CampaignRevisionStatus.Candidate&&sibling.revisesId===prior.id)sibling.revisionStatus=CampaignRevisionStatus.Stale;}
  candidate.revisionStatus=CampaignRevisionStatus.Current;candidate.approval=CampaignApproval.Approved;candidate.approvalMetadata={actorId:authority.actor,role:UserRole.Admin,approvedAt:reference.wire};new CampaignRecordPolicy().validateHistory(next);snapshot.campaignRecords=next;snapshot.revision++;return true;
 }
}
export class SetCampaignActivationStep {
 execute(snapshot:DemoSnapshot,authority:CatalogAuthority,id:string,command:CampaignCommand,expected:string,environment:string):boolean{
  new AuthorizeCampaignsStep().execute(authority,snapshot);const row=snapshot.campaignRecords.find(value=>value.id===id);if(!row||!new CampaignRecordPolicy().known(row)||row.revisionStatus!==CampaignRevisionStatus.Current||![CampaignCommand.Pause,CampaignCommand.Resume].includes(command))throw new CampaignError(CampaignIssue.Shape);
  const target=command===CampaignCommand.Pause?CampaignActivation.Paused:CampaignActivation.Enabled;if(row.activation===target){const prior={...row,activation:target===CampaignActivation.Paused?CampaignActivation.Enabled:CampaignActivation.Paused};if(campaignFingerprint(row)===expected||campaignFingerprint(prior)===expected)return false;throw new CampaignError(CampaignIssue.Conflict);}if(campaignFingerprint(row)!==expected||campaignEnvironmentFingerprint(snapshot)!==environment)throw new CampaignError(CampaignIssue.Conflict);
  if(command===CampaignCommand.Resume)new ValidateCampaignApprovalStep().execute(snapshot,row,new SnapshotOfferClock(()=>snapshot.offerReference).capture());row.activation=target;snapshot.revision++;return true;
 }
}
