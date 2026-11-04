import {UserRole} from '../../domain/user/user-role';
import {CampaignActivation,CampaignApproval,CampaignCurrency,CampaignRevisionStatus,CampaignIssue,CampaignError} from './campaign-types';
import {CampaignInstant} from './campaign-clock';
export interface DemoCampaignRecord {id:string;familyId:string;revision:number;revisesId:string|null;revisionStatus:CampaignRevisionStatus;title:string;skus:string[];currency:CampaignCurrency;activation:CampaignActivation;approval:CampaignApproval;startsAt:string;endsAt:string;priority:number;declaredMarginBps:number|null;approvalMetadata:{actorId:string;role:UserRole;approvedAt:string}|null;}
const wire=(raw:unknown):unknown=>raw&&typeof raw==='object'&&'wire'in raw?raw.wire:raw;
export class CampaignRecordPolicy {
 known(row:DemoCampaignRecord):boolean{return row.activation!==CampaignActivation.Unknown&&row.approval!==CampaignApproval.Unknown&&row.currency!==CampaignCurrency.Unknown&&row.revisionStatus!==CampaignRevisionStatus.Unknown&&(!row.approvalMetadata||row.approvalMetadata.role===UserRole.Admin);}
 editable(row:DemoCampaignRecord):boolean{return this.known(row)&&(row.revisionStatus===CampaignRevisionStatus.Candidate||row.revisionStatus===CampaignRevisionStatus.Current);}
 clone(row:DemoCampaignRecord):DemoCampaignRecord{return{...row,skus:[...row.skus],approvalMetadata:row.approvalMetadata?{...row.approvalMetadata}:null};}
 validate(row:DemoCampaignRecord):void{
  const fail=(issue=CampaignIssue.Shape):never=>{throw new CampaignError(issue);};
  for(const id of [row.id,row.familyId])if(typeof id!=='string'||!id||id.length>100)fail();
  if(typeof row.title!=='string'||row.title.length>120)fail(CampaignIssue.Title);
  if(!Array.isArray(row.skus)||row.skus.length>20||new Set(row.skus).size!==row.skus.length||row.skus.some(sku=>typeof sku!=='string'||!/^[A-Z0-9][A-Z0-9._-]{0,99}$/.test(sku)))fail(CampaignIssue.Scope);
  if(!Number.isSafeInteger(row.revision)||row.revision<1||row.revisesId!==null&&(typeof row.revisesId!=='string'||!row.revisesId||row.revisesId===row.id))fail();
  if(!Number.isSafeInteger(row.priority)||row.priority<0||row.priority>100000)fail(CampaignIssue.Priority);
  if(row.declaredMarginBps!==null&&(!Number.isSafeInteger(row.declaredMarginBps)||row.declaredMarginBps<0||row.declaredMarginBps>10000))fail(CampaignIssue.Margin);
  if(typeof row.startsAt!=='string'||typeof row.endsAt!=='string')fail();
  const metadata=row.approvalMetadata;
  if(metadata&&(typeof metadata.actorId!=='string'||!metadata.actorId||metadata.actorId.length>100||!CampaignInstant.fromWire(metadata.approvedAt).known))fail();
  if(row.approval===CampaignApproval.Draft&&metadata!==null||row.approval===CampaignApproval.Approved&&metadata===null)fail();
  if(row.approval!==CampaignApproval.Unknown&&([CampaignRevisionStatus.Candidate,CampaignRevisionStatus.Stale].includes(row.revisionStatus)&&row.approval!==CampaignApproval.Draft||[CampaignRevisionStatus.Current,CampaignRevisionStatus.Superseded].includes(row.revisionStatus)&&row.approval!==CampaignApproval.Approved))fail();
  if(row.approval===CampaignApproval.Approved){const start=CampaignInstant.fromWire(row.startsAt),end=CampaignInstant.fromWire(row.endsAt);if(!row.title.trim()||!row.skus.length||row.declaredMarginBps===null||!start.known||!end.known||start.time!>=end.time!)fail();}
 }
 validateHistory(rows:DemoCampaignRecord[]):void{
  const fail=():never=>{throw new CampaignError(CampaignIssue.Conflict);};
  if(new Set(rows.map(row=>row.id)).size!==rows.length)fail();
  for(const row of rows){
   if(rows.filter(other=>other.familyId===row.familyId&&other.revisionStatus===CampaignRevisionStatus.Current).length>1)fail();
   const committed=[CampaignRevisionStatus.Current,CampaignRevisionStatus.Superseded];
   if(committed.includes(row.revisionStatus)&&rows.filter(other=>other.familyId===row.familyId&&other.revision===row.revision&&committed.includes(other.revisionStatus)).length!==1)fail();
   if(row.revisionStatus===CampaignRevisionStatus.Superseded&&rows.filter(other=>other.revisesId===row.id&&committed.includes(other.revisionStatus)).length!==1)fail();
   if(row.revisesId===null){if(row.revision!==1||row.familyId!==row.id||row.revisionStatus===CampaignRevisionStatus.Stale)fail();}else{const prior=rows.find(other=>other.id===row.revisesId);if(!prior||prior.familyId!==row.familyId||prior.revision+1!==row.revision)fail();
    if(row.revisionStatus===CampaignRevisionStatus.Candidate&&prior!.revisionStatus!==CampaignRevisionStatus.Current)fail();
    if([CampaignRevisionStatus.Current,CampaignRevisionStatus.Superseded,CampaignRevisionStatus.Stale].includes(row.revisionStatus)&&prior!.revisionStatus!==CampaignRevisionStatus.Superseded)fail();
   }
   const seen=new Set([row.id]);let id=row.revisesId;while(id!==null){if(seen.has(id))fail();seen.add(id);const prior=rows.find(other=>other.id===id);if(!prior)fail();id=prior!.revisesId;}
  }
 }
}
export class CampaignRecordCodec {
 static fromWire(raw:unknown):DemoCampaignRecord[]{
  if(!Array.isArray(raw))throw new CampaignError(CampaignIssue.Shape);
  const policy=new CampaignRecordPolicy(),rows=raw.map(value=>{
   if(!value||typeof value!=='object'||!['id','familyId','revision','revisesId','revisionStatus','title','skus','currency','activation','approval','startsAt','endsAt','priority','declaredMarginBps','approvalMetadata'].every(key=>Object.prototype.hasOwnProperty.call(value,key)))throw new CampaignError(CampaignIssue.Shape);
   const row:DemoCampaignRecord={id:value.id,familyId:value.familyId,revision:value.revision,revisesId:value.revisesId,revisionStatus:CampaignRevisionStatus.fromWire(wire(value.revisionStatus)),title:value.title,skus:Array.isArray(value.skus)?[...value.skus]:value.skus,currency:CampaignCurrency.fromWire(wire(value.currency)),activation:CampaignActivation.fromWire(wire(value.activation)),approval:CampaignApproval.fromWire(wire(value.approval)),startsAt:value.startsAt,endsAt:value.endsAt,priority:value.priority,declaredMarginBps:value.declaredMarginBps,approvalMetadata:value.approvalMetadata===null?null:{actorId:value.approvalMetadata?.actorId,role:UserRole.fromWire(wire(value.approvalMetadata?.role)),approvedAt:value.approvalMetadata?.approvedAt}};
   policy.validate(row);return row;
  });policy.validateHistory(rows);return rows;
 }
}
export class MigrateCampaignsV6ToV7Step {
 execute(snapshot:{version:number;campaignRecords?:unknown}):DemoCampaignRecord[]{return CampaignRecordCodec.fromWire(snapshot.version<=6&&!Object.prototype.hasOwnProperty.call(snapshot,'campaignRecords')?[]:snapshot.campaignRecords);}
}
