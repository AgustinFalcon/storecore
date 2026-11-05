export class CartReviewState {
 private constructor(readonly wire:string,readonly label:string,readonly blocksCheckout:boolean){}
 static readonly Ready=new CartReviewState('ready','Precio revisado',false);
 static readonly PriceChanged=new CartReviewState('price-changed','El precio cambió o la oferta venció. Revisá el nuevo importe antes de continuar.',true);
 static readonly Unreviewed=new CartReviewState('unreviewed','Revisá el precio actual antes de continuar.',true);
 static readonly Unavailable=new CartReviewState('unavailable','Producto o presentación no disponible para esta cantidad. Conservamos tu línea: ajustá la cantidad o quitala.',true);
 static readonly Unknown=new CartReviewState('unknown','No se puede verificar esta línea.',true);
 static readonly all=[this.Ready,this.PriceChanged,this.Unreviewed,this.Unavailable];
 static fromWire(raw:unknown):CartReviewState{return this.all.find(value=>value.wire===raw)??this.Unknown;}
 static evaluate(unit:number,reviewed:number|undefined,quantity:number,available:number):CartReviewState {
  if(!Number.isSafeInteger(unit)||unit<1||available<quantity)return this.Unavailable;
  if(reviewed===undefined)return this.Unreviewed;
  return reviewed===unit?this.Ready:this.PriceChanged;
 }
}
