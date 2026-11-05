import {CampaignActivation,CampaignApproval,CampaignCurrency,CampaignRevisionStatus} from './campaign-types';
import {CampaignRecordPolicy,type DemoCampaignRecord} from './campaign-record';
import {CampaignLocalDate} from './campaign-clock';
export class CampaignDraft {
 readonly value:DemoCampaignRecord;start='';end='';priority='0';margin='';
 constructor(row?:DemoCampaignRecord,id:string=crypto.randomUUID()){
  this.value=row?new CampaignRecordPolicy().clone(row):{id,familyId:id,revision:1,revisesId:null,revisionStatus:CampaignRevisionStatus.Candidate,title:'',skus:[],currency:CampaignCurrency.ARS,activation:CampaignActivation.Enabled,approval:CampaignApproval.Draft,startsAt:'',endsAt:'',priority:0,declaredMarginBps:null,approvalMetadata:null};
  if(row?.revisionStatus===CampaignRevisionStatus.Current){this.value.id=id;this.value.revisesId=row.id;this.value.revision=row.revision+1;this.value.revisionStatus=CampaignRevisionStatus.Candidate;this.value.approval=CampaignApproval.Draft;this.value.approvalMetadata=null;}
  this.start=CampaignLocalDate.fromWire(this.value.startsAt);this.end=CampaignLocalDate.fromWire(this.value.endsAt);this.priority=String(this.value.priority);this.margin=this.value.declaredMarginBps===null?'':String(this.value.declaredMarginBps);
 }
 toggle(sku:string,checked:boolean){this.value.skus=checked?[...new Set([...this.value.skus,sku])]:this.value.skus.filter(value=>value!==sku);}
 record():DemoCampaignRecord{return{...new CampaignRecordPolicy().clone(this.value),startsAt:CampaignLocalDate.toWire(this.start),endsAt:CampaignLocalDate.toWire(this.end),priority:/^\d+$/.test(this.priority)?Number(this.priority):NaN,declaredMarginBps:this.margin===''?null:/^\d+$/.test(this.margin)?Number(this.margin):NaN};}
}
