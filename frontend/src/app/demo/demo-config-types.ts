export class DemoCampaignState {
  private constructor(readonly wire:string,readonly label:string,readonly active:boolean){}
  static readonly Active=new DemoCampaignState('ACTIVE','Activa',true);
  static readonly Paused=new DemoCampaignState('PAUSED','Pausada',false);
  static readonly Unknown=new DemoCampaignState('','Campaña desconocida',false);
  static readonly all=[this.Active,this.Paused];
  static fromWire(raw:unknown):DemoCampaignState{return this.all.find(value=>value.wire===raw)??this.Unknown;}
  get next():DemoCampaignState{return this===DemoCampaignState.Active?DemoCampaignState.Paused:this===DemoCampaignState.Paused?DemoCampaignState.Active:DemoCampaignState.Unknown;}
}
export class DemoModuleState {
  private constructor(readonly wire:string,readonly label:string,readonly enabled:boolean){}
  static readonly Enabled=new DemoModuleState('ENABLED','Activo en la demo',true);
  static readonly Paused=new DemoModuleState('PAUSED','Pausado',false);
  static readonly Unknown=new DemoModuleState('','Módulo desconocido',false);
  static readonly all=[this.Enabled,this.Paused];
  static fromWire(raw:unknown):DemoModuleState{return this.all.find(value=>value.wire===raw)??this.Unknown;}
  get next():DemoModuleState{return this===DemoModuleState.Enabled?DemoModuleState.Paused:this===DemoModuleState.Paused?DemoModuleState.Enabled:DemoModuleState.Unknown;}
}
