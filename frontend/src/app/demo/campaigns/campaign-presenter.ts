import type {DemoSnapshot} from '../demo-model';
import type {CatalogAuthority} from '../admin-catalog/catalog-flow';
import {SnapshotOfferClock} from './campaign-clock';
import {CampaignQuery} from './campaign-query';
import {CampaignRevisionStatus} from './campaign-types';
import {AuthorizeCampaignsStep,ProjectCampaignLifecycleStep,ValidateCampaignIntervalStep} from './campaign-flow';
export class CampaignsPresenter {
 readonly size=6;
 execute(snapshot:DemoSnapshot,authority:CatalogAuthority,criteria:CampaignQuery){
  if(!new AuthorizeCampaignsStep().permits(authority,snapshot))return{rows:[],all:[],count:0,start:0,end:0,page:0,pages:1};
  const reference=new SnapshotOfferClock(()=>snapshot.offerReference).capture(),all=snapshot.campaignRecords.filter(row=>![CampaignRevisionStatus.Superseded,CampaignRevisionStatus.Stale].includes(row.revisionStatus)).map(record=>({record,lifecycle:new ProjectCampaignLifecycleStep().execute(record,reference),validity:new ValidateCampaignIntervalStep().execute(record)})).sort((a,b)=>a.record.id.localeCompare(b.record.id));
  const q=criteria.q.toLocaleLowerCase('es-AR'),filtered=criteria.valid?all.filter(row=>(!q||(row.record.id+' '+row.record.title+' '+row.record.skus.join(' ')).toLocaleLowerCase('es-AR').includes(q))&&(!criteria.lifecycle.value||criteria.lifecycle.value===row.lifecycle)&&(!criteria.approval.value||criteria.approval.value===row.record.approval)&&(!criteria.revisionStatus.value||criteria.revisionStatus.value===row.record.revisionStatus)):[],pages=Math.max(1,Math.ceil(filtered.length/this.size)),page=Math.min(criteria.page,pages-1);
  return{all,rows:filtered.slice(page*this.size,(page+1)*this.size),count:filtered.length,page,pages,start:filtered.length?page*this.size+1:0,end:Math.min(filtered.length,(page+1)*this.size)};
 }
}
