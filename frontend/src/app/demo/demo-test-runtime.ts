import { DemoCommerce, DemoContext, demoSeed, type DemoSnapshot, type DemoSession } from './demo-model';

/** Test-only session driver: every command still passes the production authorization ports. */
export function demoTestRuntime(snapshot:DemoSnapshot=demoSeed(),now:()=>string=()=>new Date().toISOString(),id:()=>string=()=>crypto.randomUUID()){
  let session:DemoSession={actorId:'admin',context:DemoContext.Admin};
  const commerce=new DemoCommerce(snapshot,now,id,()=>session);
  return Object.assign(commerce,{
    sessionAsCustomer(actorId='cliente'){session={actorId,context:DemoContext.Customer};},
    sessionAsAdmin(){session={actorId:'admin',context:DemoContext.Admin};},
    sessionAsGuest(){session={actorId:'',context:DemoContext.Unknown};},
  });
}

/** Historical wire fixture, deliberately translated only through decodeSnapshot. */
export function legacyDemoWire(version:1|4|5):string {
  const seed=demoSeed();
  return JSON.stringify({...seed,version,
    campaigns:seed.campaigns.map(campaign=>({...campaign,active:campaign.state.active,state:undefined})),
    modules:seed.modules.map(module=>({id:module.id,enabled:module.state.enabled})),
    products:seed.products.filter(product=>product.sku!=='VLD-043').map(product=>({sku:product.sku,name:product.name,description:product.description,brand:product.brand,category:product.category,price:product.price,original:product.original,onHand:product.onHand,reserved:product.reserved,active:product.publication.published,tone:product.tone,variant:product.variant})),
    actors:seed.actors.filter(actor=>actor.id!=='admin').map(actor=>({...actor,role:undefined})),
    orders:seed.orders.map(order=>({...order,returned:false,reservation:undefined,lines:order.lines.map(line=>({sku:line.sku,name:line.name,quantity:line.quantity,unit:line.unit}))})),
    marketplace:version===5?seed.marketplace:undefined,
    returns:undefined,postSaleAlerts:undefined,
  });
}
