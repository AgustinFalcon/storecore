/** Closed presentation identity; both presentations consume the same SKU stock pool. */
export class DemoProductVariant {
  private constructor(readonly wire:string,readonly label:string,readonly extraUnit:number){}
  static readonly Standard=new DemoProductVariant('standard','Estándar',0);
  static readonly Case=new DemoProductVariant('with-case','Con estuche de transporte',250000);
  static readonly Unknown=new DemoProductVariant('','Variante desconocida',0);
  static readonly all=[this.Standard,this.Case];
  static fromWire(raw:unknown):DemoProductVariant{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
