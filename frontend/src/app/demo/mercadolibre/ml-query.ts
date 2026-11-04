import {MLTab,MLIntentType,MLEventType} from './ml-types';
export class MLQuery {
 private constructor(readonly tab:MLTab,readonly q:string,readonly type:MLIntentType|null,readonly status:MLEventType|null,readonly page:number,readonly focus:string){}
 static fromWire(p:Record<string,unknown>){return new MLQuery(p['tab']==null?MLTab.Account:MLTab.fromWire(p['tab']),typeof p['q']==='string'?p['q'].slice(0,200):'',p['type']?MLIntentType.fromWire(p['type']):null,p['status']?MLEventType.fromWire(p['status']):null,typeof p['page']==='string'&&/^[1-9]\d*$/.test(p['page'])&&Number.isSafeInteger(Number(p['page']))?Number(p['page']):1,typeof p['focus']==='string'?p['focus'].slice(0,100):'');}
 get known(){return this.tab!==MLTab.Unknown&&this.type!==MLIntentType.Unknown&&this.status!==MLEventType.Unknown;}
 get params(){return {tab:this.tab.wire,q:this.q||null,type:this.type?.wire??null,status:this.status?.wire??null,page:this.page,focus:this.focus||null};}
}
