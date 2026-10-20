import { DemoVariantReferenceIndex, DemoVariantReferenceKind as Kind, type DemoVariantReferenceSource } from './variant-reference-index';
import { DemoProductPolicy } from './product-policy';
import { DemoScenario, decodeSnapshot, demoSeed, type DemoSnapshot } from '../demo-model';
import { demoTestRuntime } from '../demo-test-runtime';
import { DemoDeliveryMethod, DemoPaymentMethod } from '../demo-process-types';
import { DemoReturnReason } from '../postsale/postsale-types';
import { DemoFulfillmentAction } from '../demo-fulfillment';
import { ensureCompetitorDetails } from '../demo-marketplace';

const sku='DEMO-005',variantId='DEMO-005:with-case',identity={sku,variantId};
const proposal=(snapshot:DemoSnapshot)=>{
  const product=DemoProductPolicy.clone(snapshot.products.find(value=>value.sku===sku)!);
  product.variants=product.variants.filter(value=>value.id!==variantId);
  return product;
};

describe('pure variant reference index',()=>{
  const cases: {kind:Kind; source:Partial<DemoVariantReferenceSource>}[]=[
    {kind:Kind.Cart,source:{actors:[{cart:[identity]}]}},
    {kind:Kind.Order,source:{orders:[{lines:[identity]}]}},
    {kind:Kind.Reservation,source:{orders:[{lines:[],reservation:{lines:[identity]}}]}},
    {kind:Kind.Movement,source:{movements:[identity]}},
    {kind:Kind.Return,source:{returns:[{lines:[identity]}]}},
    {kind:Kind.Mapping,source:{marketplace:{mappings:[{...identity,id:'mapping'}],queue:[]}}},
    {kind:Kind.Queue,source:{marketplace:{mappings:[{...identity,id:'mapping'}],queue:[{mappingId:'mapping'}]}}},
    {kind:Kind.Competitor,source:{competitors:[{sku,details:{variantId}}]}},
  ];
  it.each(cases)('preserves a variant referenced by $kind.label without mutating its source',({kind,source})=>{
    const snapshot=demoSeed(),product=snapshot.products.find(value=>value.sku===sku)!;
    const input={revision:0,products:[product],...source},before=JSON.stringify(input);
    const index=DemoVariantReferenceIndex.from(input);
    expect(index.references(sku,variantId)).toContain(kind);
    expect(()=>index.requirePreserved(product,proposal(snapshot))).toThrow('referenciada');
    expect(()=>index.validateCatalog([proposal(snapshot)])).toThrow('inexistente');
    expect(JSON.stringify(input)).toBe(before);
  });
  it('uses the composite SKU and variant identity and keeps its reference kinds closed',()=>{
    const snapshot=demoSeed(),product=snapshot.products.find(value=>value.sku===sku)!;
    const index=DemoVariantReferenceIndex.from({revision:0,products:[product],movements:[{sku:'other-sku',variantId}]});
    expect(()=>index.requirePreserved(product,proposal(snapshot))).not.toThrow();
    for(const kind of Kind.all)expect(Kind.fromWire(kind.wire)).toBe(kind);
    expect(Kind.fromWire('arbitrary')).toBe(Kind.Unknown);
  });
});

describe('catalog saves preserve durable references before any mutation',()=>{
  function fixture(kind:Kind){
    const commerce=demoTestRuntime(demoSeed());
    if(kind===Kind.Cart){commerce.sessionAsCustomer();commerce.add('cliente',sku,1,variantId);}
    if(kind===Kind.Order||kind===Kind.Reservation||kind===Kind.Return){
      commerce.sessionAsCustomer();commerce.add('cliente',sku,1,variantId);
      const order=commerce.checkout('cliente','referenced','address-cliente',kind===Kind.Reservation?DemoScenario.Pending:DemoScenario.Approved,DemoPaymentMethod.Card,DemoDeliveryMethod.Home);
      if(kind===Kind.Return){
        commerce.sessionAsAdmin();commerce.fulfill(order.id,DemoFulfillmentAction.Dispatch);commerce.fulfill(order.id,DemoFulfillmentAction.Deliver);
        commerce.sessionAsCustomer();commerce.postSale.request('cliente','return',order.id,[{...identity,quantity:1,reason:DemoReturnReason.all[0]}]);
      }
    }
    commerce.sessionAsAdmin();
    if(kind===Kind.Movement)commerce.adjust(sku,1,'Ingreso',variantId);
    if(kind===Kind.Mapping||kind===Kind.Queue)commerce.mapML(sku,variantId,'SIM-five-case','SIM-five-case');
    if(kind===Kind.Competitor){commerce.watchCompetitor('Comparación de muestra',sku,10);const competitor=commerce.snapshot.competitors.at(-1)!;ensureCompetitorDetails(competitor,commerce.snapshot).variantId=variantId;}
    return commerce;
  }
  it.each(Kind.all)('direct saveProduct rejects removal with $label and the aggregate still reloads',kind=>{
    const commerce=fixture(kind),before=JSON.stringify(commerce.snapshot);
    expect(DemoVariantReferenceIndex.from(commerce.snapshot).references(sku,variantId)).toContain(kind);
    expect(()=>decodeSnapshot(before)).not.toThrow();
    expect(()=>commerce.saveProduct(proposal(commerce.snapshot),sku)).toThrow('referenciada');
    expect(JSON.stringify(commerce.snapshot)).toBe(before);
    const restored=decodeSnapshot(JSON.stringify(commerce.snapshot));
    expect(restored.products.find(value=>value.sku===sku)!.variants.some(value=>value.id===variantId)).toBe(true);
    const corrupted=JSON.parse(before),product=corrupted.products.find((value:{sku:string})=>value.sku===sku);
    product.variants=product.variants.filter((value:{id:string})=>value.id!==variantId);
    product.onHand=product.variants.reduce((sum:number,value:{onHand:number})=>sum+value.onHand,0);
    product.reserved=product.variants.reduce((sum:number,value:{reserved:number})=>sum+value.reserved,0);
    expect(()=>decodeSnapshot(JSON.stringify(corrupted))).toThrow();
  });
  it('rejects renaming an identity and preserves unlinked marketplace history atomically',()=>{
    const commerce=fixture(Kind.Mapping),mapping=commerce.snapshot.marketplace!.mappings.find(value=>value.sku===sku)!;
    commerce.unlinkML(mapping.id);
    const draft=DemoProductPolicy.clone(commerce.product(sku));draft.variants.find(value=>value.id===variantId)!.id='replacement';
    const before=JSON.stringify(commerce.snapshot);
    expect(()=>commerce.saveProduct(draft,sku)).toThrow('referenciada');expect(JSON.stringify(commerce.snapshot)).toBe(before);
    expect(()=>decodeSnapshot(before)).not.toThrow();
  });
  it('permits removing an unused empty variant and persists a decodable aggregate',()=>{
    const commerce=demoTestRuntime(),product=commerce.product(sku);
    product.variants.find(value=>value.id===variantId)!.onHand=0;commerce.catalog.refreshTotals(product);
    commerce.saveProduct(proposal(commerce.snapshot),sku);
    const restored=decodeSnapshot(JSON.stringify(commerce.snapshot));
    expect(restored.products.find(value=>value.sku===sku)!.variants.map(value=>value.id)).toEqual([sku+':standard']);
  });
  it('allows editing retained presentation without rewriting frozen paid line details or money',()=>{
    const commerce=fixture(Kind.Order),order=commerce.snapshot.orders.at(-1)!,frozen=JSON.stringify(order.lines);
    const draft=DemoProductPolicy.clone(commerce.product(sku)),variant=draft.variants.find(value=>value.id===variantId)!;
    variant.label='Nombre actual distinto';variant.attributes=[{name:'Color',value:'Actual'}];variant.price+=100;variant.original+=100;
    commerce.saveProduct(draft,sku);
    expect(JSON.stringify(order.lines)).toBe(frozen);
    expect(JSON.stringify(decodeSnapshot(JSON.stringify(commerce.snapshot)).orders.at(-1)!.lines)).toBe(frozen);
  });
});
