import {CampaignLifecycle,CampaignApproval,CampaignRevisionStatus} from './campaign-types';
export class CampaignLifecycleFilter {
 private constructor(readonly wire:string,readonly label:string,readonly value:CampaignLifecycle|null){}
 static readonly All=new CampaignLifecycleFilter('all','Todos',null);
 static readonly Unknown=new CampaignLifecycleFilter('unknown',CampaignLifecycle.Unknown.label,CampaignLifecycle.Unknown);
 static readonly all=[this.All,...CampaignLifecycle.all.map(value=>new CampaignLifecycleFilter(value.wire,value.label,value)),this.Unknown];
 static fromWire(raw:unknown):CampaignLifecycleFilter{return raw==null?this.All:this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignApprovalFilter {
 private constructor(readonly wire:string,readonly label:string,readonly value:CampaignApproval|null){}
 static readonly All=new CampaignApprovalFilter('all','Todos',null);
 static readonly Unknown=new CampaignApprovalFilter('unknown',CampaignApproval.Unknown.label,CampaignApproval.Unknown);
 static readonly all=[this.All,...CampaignApproval.all.map(value=>new CampaignApprovalFilter(value.wire,value.label,value)),this.Unknown];
 static fromWire(raw:unknown):CampaignApprovalFilter{return raw==null?this.All:this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignRevisionFilter {
 private constructor(readonly wire:string,readonly label:string,readonly value:CampaignRevisionStatus|null){}
 static readonly All=new CampaignRevisionFilter('all','Todos',null);
 static readonly Unknown=new CampaignRevisionFilter('unknown',CampaignRevisionStatus.Unknown.label,CampaignRevisionStatus.Unknown);
 static readonly all=[this.All,...[CampaignRevisionStatus.Candidate,CampaignRevisionStatus.Current].map(value=>new CampaignRevisionFilter(value.wire,value.label,value)),this.Unknown];
 static fromWire(raw:unknown):CampaignRevisionFilter{return raw==null?this.All:this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CampaignQuery {
 private constructor(readonly q:string,readonly lifecycle:CampaignLifecycleFilter,readonly approval:CampaignApprovalFilter,readonly revisionStatus:CampaignRevisionFilter,readonly page:number,readonly valid:boolean){}
 static fromWire(raw:Record<string,unknown>):CampaignQuery{const q=typeof raw['q']==='string'?raw['q']:'',lifecycle=CampaignLifecycleFilter.fromWire(raw['lifecycle']),approval=CampaignApprovalFilter.fromWire(raw['approval']),revisionStatus=CampaignRevisionFilter.fromWire(raw['revisionStatus']),page=raw['page']==null?0:typeof raw['page']==='string'&&/^[1-9]\d*$/.test(raw['page'])?Number(raw['page'])-1:NaN;const filters=[['lifecycle',lifecycle],['approval',approval],['revisionStatus',revisionStatus]] as const;return new CampaignQuery(q.slice(0,120),lifecycle,approval,revisionStatus,Number.isSafeInteger(page)&&page>=0?page:0,q.length<=120&&Number.isSafeInteger(page)&&page>=0&&filters.every(([key,value])=>raw[key]==null||value.wire===raw[key]));}
 get query():Record<string,string>{return{...(this.q?{q:this.q}:{}),...(this.lifecycle!==CampaignLifecycleFilter.All?{lifecycle:this.lifecycle.wire}:{}),...(this.approval!==CampaignApprovalFilter.All?{approval:this.approval.wire}:{}),...(this.revisionStatus!==CampaignRevisionFilter.All?{revisionStatus:this.revisionStatus.wire}:{}),...(this.page?{page:String(this.page+1)}:{})};}
}

/** Historical states have their own filter; they are never options in the principal list. */
export class CampaignHistoryFilter {
 private constructor(readonly wire:string,readonly label:string,readonly value:CampaignRevisionStatus|null){}
 static readonly All=new CampaignHistoryFilter('all','Todas las revisiones históricas',null);
 static readonly Superseded=new CampaignHistoryFilter(CampaignRevisionStatus.Superseded.wire,CampaignRevisionStatus.Superseded.label,CampaignRevisionStatus.Superseded);
 static readonly Stale=new CampaignHistoryFilter(CampaignRevisionStatus.Stale.wire,CampaignRevisionStatus.Stale.label,CampaignRevisionStatus.Stale);
 static readonly Unknown=new CampaignHistoryFilter('unknown','Filtro de historial desconocido',CampaignRevisionStatus.Unknown);
 static readonly all=[this.All,this.Superseded,this.Stale];
 static fromWire(raw:unknown):CampaignHistoryFilter{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
