import { DemoCampaignState, DemoModuleState } from './demo-config-types';
import { DemoContext, DemoModuleId, DEMO_PICKUP_DESTINATION, demoSeed, type DemoSnapshot, type DemoOrder, type DemoActor } from './demo-model';
import { DemoRole } from './demo-roles';
import { DemoCatalogWire } from './catalog/catalog-wire';
import { DemoProductPolicy } from './catalog/product-policy';
import { DemoVariantReferenceIndex } from './catalog/variant-reference-index';
import { ProductPublication, ProductCondition, VariantSaleState } from './catalog/catalog-types';
import type { DemoProduct, DemoProductVariantRecord } from './catalog/catalog-model';
import { DemoCatalogQuery } from './catalog/demo-catalog-query';
import { DemoPostSaleWire } from './postsale/postsale-wire';
import { DemoReturnIdentity } from './postsale/return-identity';
import { DemoReservationState } from './checkout/demo-reservation-state';
import { OrderStatus } from '../domain/order/order-status';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoPaymentMethod, DemoDeliveryMethod, DemoSyncStatus } from './demo-process-types';
import { decodeFulfillment } from './demo-fulfillment';
import { decodeInbox } from './demo-inbox';
import { decodeMarketplace, ensureMarketplace } from './demo-marketplace';

const wire = (value: unknown): unknown => value && typeof value === 'object' && 'wire' in value ? value.wire : value;
const statusWire = (value: unknown): string | undefined => { const raw = wire(value); return typeof raw === 'string' ? raw : undefined; };
const record = (value: unknown): Record<string, unknown> => { if(!value||typeof value!=='object')throw new Error('Snapshot inválido.');return value as Record<string,unknown>; };
const integer = (value: unknown): value is number => Number.isSafeInteger(value)&&Number(value)>=0;
const items = (value: unknown): unknown[] => {if(!Array.isArray(value))throw new Error('Falta una colección de la demo guardada.');return value;};

/** Explicit upgrade step. Legacy booleans and package aliases are read only here. */
class LegacyCatalogUpgrade {
  product(raw: unknown, index: number): DemoProduct {
    const value=record(raw),sku=String(value['sku']??''),price=Number(value['price']),original=Number(value['original']);
    if(!integer(value['onHand'])||!integer(value['reserved'])||Number(value['reserved'])>Number(value['onHand']))throw new Error('Stock legacy inválido.');
    const media=[{id:`${sku}-front`,src:`/assets/demo/DEMO-${String(index%12+1).padStart(3,'0')}.svg`,alt:`${String(value['name'])}, ilustración de muestra`}];
    let variants: DemoProductVariantRecord[];
    if(Array.isArray(value['variants'])) {
      variants=value['variants'].map(rawVariant=>{const variant=record(rawVariant);return {id:String(variant['id']??''),label:String(variant['name']??variant['label']??''),price:Number(variant['price']),original:Math.max(original,Number(variant['price'])),onHand:Number(variant['onHand']),reserved:Number(variant['reserved']),notSellable:Number(variant['notSellable']??0),saleState:variant['active']===true?VariantSaleState.Active:variant['active']===false?VariantSaleState.Disabled:VariantSaleState.Unknown,condition:ProductCondition.Standard,outlet:null,attributes:Array.isArray(variant['attributes'])?variant['attributes'] as {name:string;value:string}[]:[],pickupLocation:DEMO_PICKUP_DESTINATION};});
    } else {
      // Historical package choices shared one stock balance. Migrate exactly one variant.
      variants=[{id:`${sku}:standard`,label:String(value['variant']??'Estándar'),price,original,onHand:Number(value['onHand']),reserved:Number(value['reserved']),notSellable:0,saleState:VariantSaleState.Active,condition:ProductCondition.Standard,outlet:null,attributes:[],pickupLocation:DEMO_PICKUP_DESTINATION}];
    }
    return DemoCatalogWire.product({sku,name:value['name'],description:value['description'],brand:value['brand'],category:value['category'],price,original,onHand:value['onHand'],reserved:value['reserved'],publication:value['active']===true?ProductPublication.Published:value['active']===false?ProductPublication.Archived:ProductPublication.Unknown,tone:value['tone'],variant:value['variant'],attributes:[],media,variants});
  }
  variant(raw:Record<string,unknown>,product:DemoProduct):string {
    if(raw['variantId']!==undefined){if(typeof raw['variantId']==='string'&&raw['variantId'].trim())return raw['variantId'];throw new Error('La identidad explícita de variante es inválida.');}
    const alias=wire(raw['variant']);
    if(alias===undefined||alias==='standard')return `${product.sku}:standard`;
    // Legacy packages had no independently reserved stock; never invent a second balance.
    throw new Error('La presentación legacy requiere restablecer la demostración; no existe una variante con stock propio.');
  }
}

/** One ordered persistence boundary: upgrade -> catalog -> checkout -> post-sale -> delivery -> inbox -> channel. */
export function decodeSnapshot(raw:string):DemoSnapshot {
  const source=record(JSON.parse(raw));
  const version=source['version'];
  if(![1,4,5,6].includes(Number(version))||typeof version!=='number'||!integer(source['revision']))throw new Error('La demo guardada tiene otra versión. Restablecé sus datos.');
  const legacy=version!==6,upgrade=new LegacyCatalogUpgrade();
  const products=items(source['products']).map((value,index)=>{
    const product=legacy?upgrade.product(value,index):DemoCatalogWire.product(value);
    const raw=product as unknown as Record<string,unknown>;
    delete raw['active'];delete raw['supportsCase'];delete raw['images'];
    for(const variant of product.variants){const rawVariant=variant as unknown as Record<string,unknown>;delete rawVariant['active'];delete rawVariant['images'];}
    return product;
  });
  if(new Set(products.map(product=>product.sku)).size!==products.length)throw new Error('Hay SKU duplicados.');
  const catalog=new DemoCatalogQuery(()=>({revision:0,products}));
  for(const product of products)if(product.onHand!==product.variants.reduce((sum,variant)=>sum+variant.onHand,0)||product.reserved!==product.variants.reduce((sum,variant)=>sum+variant.reserved,0))throw new Error('El resumen de stock no coincide con las variantes.');
  const actors=items(source['actors']).map(rawActor=>{
    const value=record(rawActor);
    const actor={...value,role:legacy?DemoRole.Customer:DemoRole.fromWire(wire(value['role'])),cart:items(value['cart']).map(rawLine=>{
      const line=record(rawLine),product=catalog.product(String(line['sku']));
      const variantId=legacy?upgrade.variant(line,product):String(line['variantId']??'');
      catalog.variant(product.sku,variantId);
      if(!integer(line['quantity'])||Number(line['quantity'])<1)throw new Error('Cantidad guardada inválida.');
      const quotedUnit=legacy?Number(line['quotedUnit']??catalog.price(product.sku,variantId)):line['quotedUnit'];
      if(!integer(quotedUnit))throw new Error('Cotización guardada inválida.');
      return {sku:product.sku,variantId,quantity:Number(line['quantity']),quotedUnit};
    })} as unknown as DemoActor;
    if(!actor.id||typeof actor.email!=='string'||typeof actor.firstName!=='string'||typeof actor.lastName!=='string'||typeof actor.phone!=='string'||!Array.isArray(actor.addresses)||!Array.isArray(actor.favorites)||actor.favorites.some(sku=>typeof sku!=='string'||!products.some(product=>product.sku===sku))||actor.addresses.some(address=>!address.id||typeof address.street!=='string'||typeof address.city!=='string'||typeof address.postal!=='string'))throw new Error('La identidad demo guardada es inválida.');
    if(new Set(actor.cart.map(line=>JSON.stringify([line.sku,line.variantId]))).size!==actor.cart.length||new Set(actor.addresses.map(address=>address.id)).size!==actor.addresses.length)throw new Error('Hay direcciones o líneas de carrito duplicadas.');
    return actor;
  });
  if(legacy&&!actors.some(actor=>actor.id==='admin'))actors.push(demoSeed().actors.find(actor=>actor.role===DemoRole.Admin)!);
  if(new Set(actors.map(actor=>actor.id)).size!==actors.length||new Set(actors.map(actor=>actor.email.trim().toLowerCase())).size!==actors.length)throw new Error('Hay identidades duplicadas.');
  const orders=items(source['orders']).map(rawOrder=>{
    const value=record(rawOrder);
    if(value['returned']===true)throw new Error('La devolución legacy necesita conciliación; restablecé la demostración.');
    const status=OrderStatus.fromWire(statusWire(value['status'])),payment=PaymentStatus.fromWire(statusWire(value['payment'])),shipment=ShipmentStatus.fromWire(statusWire(value['shipment']));
    const lines=items(value['lines']).map(rawLine=>{
      const line=record(rawLine),product=catalog.product(String(line['sku']));
      const variantId=legacy?upgrade.variant(line,product):String(line['variantId']??'');
      const variant=catalog.variant(product.sku,variantId);
      if(!integer(line['quantity'])||Number(line['quantity'])<1||!integer(line['unit']))throw new Error('Línea de pedido inválida.');
      return {sku:product.sku,variantId,name:String(line['name']??product.name),variantLabel:String(line['variantLabel']??variant.label),attributes:legacy?variant.attributes.map(attribute=>({...attribute})):items(line['attributes']) as {name:string;value:string}[],image:legacy?{...product.media[0]}:line['image'] as DemoOrder['lines'][number]['image'],quantity:Number(line['quantity']),unit:Number(line['unit'])};
    });
    const deliveryRaw=value['delivery']?record(value['delivery']):null;
    const method=value['method']===undefined&&legacy?DemoPaymentMethod.Card:DemoPaymentMethod.fromWire(wire(value['method']));
    const delivery=deliveryRaw?{...deliveryRaw,method:DemoDeliveryMethod.fromWire(wire(deliveryRaw['method']))} as unknown as NonNullable<DemoOrder['delivery']>:legacy?{method:DemoDeliveryMethod.Home,cost:0,days:5,destination:String(value['address'])}:undefined;
    const reservationRaw=value['reservation']?record(value['reservation']):null;
    const reservation=reservationRaw?{state:DemoReservationState.fromWire(wire(reservationRaw['state'])),lines:items(reservationRaw['lines']) as {sku:string;variantId:string;quantity:number}[]}:legacy?{state:payment===PaymentStatus.Pending?DemoReservationState.Held:payment===PaymentStatus.Approved?DemoReservationState.Consumed:DemoReservationState.None,lines:payment===PaymentStatus.Pending||payment===PaymentStatus.Approved?lines.map(line=>({sku:line.sku,variantId:line.variantId,quantity:line.quantity})):[]}:undefined;
    const order={...value,status,payment,shipment,method,delivery,reservation,lines} as unknown as DemoOrder;
    delete (order as unknown as Record<string,unknown>)['returned'];
    delete (order as unknown as Record<string,unknown>)['returns'];
    if(!order.id||!actors.some(actor=>actor.id===order.actor)||!Array.isArray(order.history)||!integer(order.total)||!delivery||!integer(delivery.cost)||!integer(delivery.days)||delivery.days<1||typeof delivery.destination!=='string')throw new Error('El historial demo guardado es inválido.');
    if(new Set(lines.map(line=>JSON.stringify([line.sku,line.variantId]))).size!==lines.length)throw new Error('Hay líneas de pedido duplicadas.');
    for(const line of lines)if(!DemoProductPolicy.media([line.image])||line.attributes.some(attribute=>typeof attribute.name!=='string'||!attribute.name.trim()||typeof attribute.value!=='string'||!attribute.value.trim()))throw new Error('Falta la imagen o los atributos congelados del pedido.');
    if(order.total!==lines.reduce((sum,line)=>sum+line.unit*line.quantity,0)+delivery.cost)throw new Error('El total del pedido no coincide con sus líneas y entrega.');
    return order;
  });
  if(new Set(orders.map(order=>order.id)).size!==orders.length)throw new Error('Hay pedidos duplicados.');
  const held=new Map<string,number>();
  for(const order of orders){
    const reservation=order.reservation;
    if(reservation?.state===DemoReservationState.Held){
      if(order.payment!==PaymentStatus.Pending||reservation.lines.length!==order.lines.length||new Set(reservation.lines.map(line=>JSON.stringify([line.sku,line.variantId]))).size!==reservation.lines.length||reservation.lines.some(line=>!integer(line.quantity)||line.quantity<1||!order.lines.some(purchased=>purchased.sku===line.sku&&purchased.variantId===line.variantId&&purchased.quantity===line.quantity)))throw new Error('La reserva no coincide con el pedido.');
      for(const line of reservation.lines){const key=JSON.stringify([line.sku,line.variantId]);held.set(key,(held.get(key)??0)+line.quantity);}
    }
  }
  for(const product of products)for(const variant of product.variants)if((held.get(JSON.stringify([product.sku,variant.id]))??0)>variant.reserved)throw new Error('La reserva supera el stock reservado de la variante.');
  const returns=legacy?[]:items(source['returns']).map(value=>DemoPostSaleWire.request(value));
  DemoReturnIdentity.requireUnique(returns);
  if(returns.some(request=>!orders.some(order=>order.id===request.orderId)))throw new Error('Solicitud sin pedido.');
  for(const order of orders)DemoPostSaleWire.validateOrder(order,returns);
  const state={...source,version:6,products,actors,orders,returns,postSaleAlerts:legacy?[]:items(source['postSaleAlerts'])} as unknown as DemoSnapshot;
  state.modules=items(source['modules']).map(rawModule=>{const value=record(rawModule);return {id:DemoModuleId.fromWire(wire(value['id'])),state:legacy?(value['enabled']===true?DemoModuleState.Enabled:value['enabled']===false?DemoModuleState.Paused:DemoModuleState.Unknown):DemoModuleState.fromWire(wire(value['state']))};});
  if(new Set(state.modules.map(module=>module.id)).size!==state.modules.length)throw new Error('Hay módulos duplicados.');
  state.blocks??=demoSeed().blocks;state.settings??=demoSeed().settings;
  if(typeof state.title!=='string'||!state.title.trim()||typeof state.subtitle!=='string'||!Array.isArray(state.blocks)||state.blocks.some(block=>!block.id||typeof block.title!=='string'||typeof block.body!=='string')||![state.settings.homepageItems,state.settings.lowStockThreshold,state.settings.deliveryDays,state.settings.mlRows].every(value=>integer(value)&&value>=1&&value<=30)||!/^[A-Z0-9-]{2,12}$/.test(state.settings.trackingPrefix))throw new Error('Configuración demo inválida.');
  state.campaigns=items(source['campaigns']).map(rawCampaign=>{const value=record(rawCampaign);const campaign={...value,state:legacy?(value['active']===true?DemoCampaignState.Active:value['active']===false?DemoCampaignState.Paused:DemoCampaignState.Unknown):DemoCampaignState.fromWire(wire(value['state']))} as unknown as DemoSnapshot['campaigns'][number];if(!campaign.id||typeof campaign.title!=='string'||!catalog.product(campaign.sku)||!integer(campaign.percent)||campaign.percent<1||campaign.percent>70||typeof campaign.from!=='string'||typeof campaign.until!=='string'||campaign.from>campaign.until)throw new Error('Campaña guardada inválida.');delete (campaign as unknown as Record<string,unknown>)['active'];return campaign;});
  if(new Set(state.campaigns.map(campaign=>campaign.id)).size!==state.campaigns.length)throw new Error('Hay campañas duplicadas.');
  state.competitors=items(source['competitors']) as DemoSnapshot['competitors'];state.listings=items(source['listings']) as DemoSnapshot['listings'];
  state.movements=items(source['movements']).map(rawMovement=>{const value=record(rawMovement),sku=String(value['sku']);const variantId=legacy&&value['variantId']===undefined?`${sku}:standard`:String(value['variantId']??'');catalog.variant(sku,variantId);if(!Number.isInteger(value['delta'])||typeof value['reason']!=='string')throw new Error('Movimiento inválido.');return {...value,sku,variantId} as unknown as DemoSnapshot['movements'][number];});
  state.syncJobs=(source['syncJobs']===undefined?[]:items(source['syncJobs'])).map(rawJob=>{const value=record(rawJob);if(!integer(value['desired']))throw new Error('Sincronización inválida.');return {...value,status:DemoSyncStatus.fromWire(wire(value['status']))} as unknown as NonNullable<DemoSnapshot['syncJobs']>[number];});
  for(const order of orders)decodeFulfillment(order);
  decodeInbox(state);
  if((version===5||version===6)&&!source['marketplace'])throw new Error('Falta el canal de muestra en la demo guardada.');
  decodeMarketplace(state);
  ensureMarketplace(state);
  DemoVariantReferenceIndex.from(state).validateCatalog(state.products);
  return state;
}

/** Reuse the same role/context policy when restoring session storage. */
export function validDemoSession(actor:DemoActor|undefined,context:DemoContext):boolean {
  return !!actor&&((context===DemoContext.Customer&&actor.role===DemoRole.Customer)||(context===DemoContext.Admin&&actor.role===DemoRole.Admin));
}
