import { DemoCampaignState, DemoModuleState } from './demo-config-types';
import { DEMO_PICKUP_POINT, DemoFulfillment, DemoFulfillmentAction, DemoFulfillmentPolicy, DemoIncidentKind, ensureFulfillment } from './demo-fulfillment';
import { DemoInbox } from './demo-inbox';
import { OrderStatus } from '../domain/order/order-status';
import { PaymentStatus } from '../domain/order/payment-status';
import { ShipmentStatus } from '../domain/order/shipment-status';
import { DemoPaymentMethod, DemoDeliveryMethod, DemoSyncJob, DemoCompetitor } from './demo-process-types';
import { DemoMLAccountStatus, DemoMarketplaceProjection, DemoMarketplaceMapping, DemoMarketplaceProcessor, DemoMarketplaceSale, DemoCompetitorObservationStep, DemoCompetitorAvailabilityStep, ensureMarketplace } from './demo-marketplace';
import type { DemoProduct, DemoProductVariantRecord } from './catalog/catalog-model';
import { ProductPublication, ProductCondition, VariantSaleState } from './catalog/catalog-types';
import { DemoCatalogQuery } from './catalog/demo-catalog-query';
import { DemoCatalogCommands } from './catalog/demo-catalog-commands';
import { addOutletFixture } from './catalog/outlet-fixture';
import { DemoProductPolicy } from './catalog/product-policy';
import { DemoCartCommands } from './checkout/demo-cart-commands';
import { DemoReservationState } from './checkout/demo-reservation-state';
import type { DemoOrder as CheckoutOrder, DemoActor as CheckoutActor } from './checkout/checkout-model';
import { DemoPostSaleCommands } from './postsale/demo-postsale-commands';
import type { DemoReturnRequest, DemoPostSaleAlert } from './postsale/postsale-types';
import { DemoRole } from './demo-roles';
import { DemoCustomerCommands, DemoContentCommands, DemoConfigurationCommands, DemoCampaignCommands, DemoCampaignQuote } from './demo-administration';
export type { DemoProduct, DemoProductVariantRecord } from './catalog/catalog-model';
export { decodeSnapshot } from './demo-snapshot';
export { DemoRole } from './demo-roles';
export class DemoScenario {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Approved = new DemoScenario('approved', 'Pago aprobado');
  static readonly Pending = new DemoScenario('pending', 'Pago pendiente');
  static readonly Rejected = new DemoScenario('rejected', 'Pago rechazado');
  static readonly Error = new DemoScenario('error', 'Error recuperable');
  static readonly NoStock = new DemoScenario('no-stock', 'Falta de stock');
  static readonly Unknown = new DemoScenario('', 'Escenario desconocido');
  static readonly all = [this.Approved, this.Pending, this.Rejected, this.Error, this.NoStock];
  static fromWire(raw: unknown): DemoScenario { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
}
export class DemoContext {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Customer = new DemoContext('customer', 'Cliente');
  static readonly Admin = new DemoContext('admin', 'Administración');
  static readonly Unknown = new DemoContext('', 'Visitante');
  static fromWire(raw: unknown): DemoContext { return [this.Customer, this.Admin].find(value => value.wire === raw) ?? this.Unknown; }
}
export class CheckoutStep {
  private constructor(readonly wire: string, readonly label: string, readonly index: number) {}
  static readonly Address = new CheckoutStep('address', 'Dirección', 0);
  static readonly Delivery = new CheckoutStep('delivery', 'Entrega', 1);
  static readonly Review = new CheckoutStep('review', 'Revisión y pago', 2);
  static readonly Unknown = new CheckoutStep('', 'Paso desconocido', -1);
  static readonly all = [this.Address, this.Delivery, this.Review];
  static fromWire(raw: unknown): CheckoutStep { return this.all.find(value => value.wire === raw) ?? this.Unknown; }
  next(): CheckoutStep { return CheckoutStep.all[this.index + 1] ?? this; }
  previous(): CheckoutStep { return CheckoutStep.all[this.index - 1] ?? this; }
}
export class DemoModuleId {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly Catalog = new DemoModuleId('catalog', 'Catálogo');
  static readonly Checkout = new DemoModuleId('checkout', 'Checkout');
  static readonly Shipping = new DemoModuleId('shipping', 'Envíos');
  static readonly MercadoLibre = new DemoModuleId('ml', 'Mercado Libre');
  static readonly Unknown = new DemoModuleId('', 'Módulo desconocido');
  static readonly all = [this.Catalog, this.Checkout, this.Shipping, this.MercadoLibre];
  static fromWire(raw: unknown): DemoModuleId { return this.all.find(value => value.wire === raw || value.label === raw) ?? this.Unknown; }
}
export interface DemoSettings { homepageItems: number; lowStockThreshold: number; deliveryDays: number; trackingPrefix: string; mlRows: number; }
export interface DemoContentBlock { id: string; title: string; body: string; }
export interface DemoAddress { id: string; label: string; street: string; city: string; postal: string; primary: boolean; }
export interface DemoActor extends CheckoutActor { role: DemoRole; email: string; firstName: string; lastName: string; phone: string; favorites: string[]; }
export interface DemoOrder extends CheckoutOrder { fulfillment?: DemoFulfillment; incident?: string; }
export interface DemoCampaign { id: string; title: string; sku: string; percent: number; state: DemoCampaignState; from: string; until: string; }
export interface DemoListing { sku: string; linked: boolean; observed?: number; error: boolean; desired?: number; confirmed?: number; }
export interface DemoMovement { id: string; sku: string; variantId: string; delta: number; reason: string; }
export interface DemoSnapshot { version: number; revision: number; products: DemoProduct[]; actors: DemoActor[]; orders: DemoOrder[]; returns: DemoReturnRequest[]; postSaleAlerts: DemoPostSaleAlert[]; campaigns: DemoCampaign[]; listings: DemoListing[]; movements: DemoMovement[]; title: string; subtitle: string; blocks: DemoContentBlock[]; settings: DemoSettings; modules: { id: DemoModuleId; state: DemoModuleState }[]; competitors: DemoCompetitor[]; mlConnected: boolean; syncJobs?: DemoSyncJob[]; inbox?: DemoInbox; marketplace?: import('./demo-marketplace').DemoMarketState; }
export interface DemoSession { readonly actorId: string; readonly context: DemoContext; }
export const DEMO_PICKUP_DESTINATION = `Retiro en ${DEMO_PICKUP_POINT.store} · ${DEMO_PICKUP_POINT.location} · ${DEMO_PICKUP_POINT.hours}`;
const NAMES = ['Taladro inalámbrico 20 V', 'Amoladora angular 115 mm', 'Kit de herramientas 108 piezas', 'Atornillador compacto', 'Sierra circular profesional', 'Lijadora orbital', 'Guantes de trabajo', 'Anteojos de protección', 'Casco de seguridad', 'Organizador modular', 'Caja de herramientas', 'Cinta métrica 8 m'];
export function demoSeed(): DemoSnapshot {
  const products = NAMES.map((name, index): DemoProduct => {
    const sku = `DEMO-${String(index + 1).padStart(3, '0')}`, price = (12500 + index * 8500) * 100, original = (14500 + index * 8500) * 100;
    const media = [{ id: `${sku}-front`, src: `/assets/demo/${sku}.svg`, alt: `${name}, ilustración de muestra` }, { id: `${sku}-detail`, src: `/assets/demo/DEMO-${String((index + 1) % 12 + 1).padStart(3, '0')}.svg`, alt: `${name}, detalle ilustrativo` }];
    const onHand = index === 5 ? 0 : index === 8 ? 2 : 18 + index;
    const variants: DemoProductVariantRecord[] = [{ id: `${sku}:standard`, label: 'Estándar', attributes: [{ name: 'Presentación', value: 'Estándar' }], price, original, onHand, reserved: 0, notSellable: 0, saleState: VariantSaleState.Active, condition: ProductCondition.Standard, outlet: null, pickupLocation: DEMO_PICKUP_DESTINATION }];
    if (index < 6) { const caseStock = Math.min(3, onHand); variants[0].onHand -= caseStock; variants.push({ ...variants[0], id: `${sku}:with-case`, label: 'Con estuche de transporte', attributes: [{ name: 'Presentación', value: 'Con estuche' }], price: price + 250000, original: original + 250000, onHand: caseStock }); }
    return { sku, name, category: index < 6 ? 'Herramientas' : index < 9 ? 'Seguridad' : 'Organización', brand: ['Norte', 'Avance', 'Taller'][index % 3], description: 'Producto ficticio para explorar el catálogo, las variantes y el flujo de compra.', price, original, onHand, reserved: 0, publication: ProductPublication.Published, tone: ['#e6a63f', '#667b94', '#a5b49b'][index % 3], variant: 'Estándar', attributes: [{name:'Garantía',value:'12 meses de muestra'}], media, variants };
  });
  const actor = (id: string, firstName: string, role = DemoRole.Customer): DemoActor => ({ id, role, email: `${id}@demo.invalid`, firstName, lastName: 'Demo', phone: '011 5555 0100', addresses: [{ id: `address-${id}`, label: 'Casa', street: 'Avenida de muestra 123', city: 'Buenos Aires', postal: '1406', primary: true }], favorites: [products[0].sku, products[2].sku], cart: [] });
  const orders: DemoOrder[] = [ShipmentStatus.Preparing, ShipmentStatus.Shipped, ShipmentStatus.Delivered].map((shipment,index) => {
    const product=products[index], selected=product.variants[0];
    return { id:`DEMO-10${index}`,actor:index===2?'cliente2':'cliente',request:`seed-${index}`,status:OrderStatus.Paid,payment:PaymentStatus.Approved,shipment,lines:[{sku:product.sku,variantId:selected.id,variantLabel:selected.label,name:product.name,attributes:selected.attributes.map(value=>({...value})),image:{...product.media[0]},quantity:1,unit:selected.price}],total:selected.price,address:'Avenida de muestra 123 · Buenos Aires',tracking:shipment===ShipmentStatus.Preparing?'':`SIM-000${index}`,history:['Pedido creado · 08/10/2026','Pago aprobado (simulado)',shipment.label],method:DemoPaymentMethod.Card,delivery:{method:DemoDeliveryMethod.Home,cost:0,days:5,destination:'Avenida de muestra 123 · Buenos Aires'},reservation:{state:DemoReservationState.Consumed,lines:[{sku:product.sku,variantId:selected.id,quantity:1}]} };
  });
  const state: DemoSnapshot = { version:6,revision:0,products,actors:[actor('cliente','Alex'),actor('cliente2','Sam'),actor('admin','Administrador',DemoRole.Admin)],orders,returns:[],postSaleAlerts:[],campaigns:[{id:'offer-1',title:'Equipá tu taller',sku:products[0].sku,percent:10,state:DemoCampaignState.Active,from:'2026-01-01',until:'2027-12-31'}],listings:products.slice(0,4).map(product=>({sku:product.sku,linked:true,observed:product.variants[0].onHand,error:false})),movements:[],title:'Todo para tu próximo proyecto',subtitle:'Herramientas, seguridad y organización. Elegí calidad, comprá con confianza.',blocks:[{id:'service',title:'Te ayudamos a elegir',body:'Encontrá herramientas y equipamiento para cada etapa de tu proyecto.'},{id:'quality',title:'Calidad que te acompaña',body:'Garantía y asistencia personalizada para trabajar con confianza.'}],settings:{homepageItems:4,lowStockThreshold:5,deliveryDays:5,trackingPrefix:'SIM',mlRows:6},modules:DemoModuleId.all.map(id=>({id,state:DemoModuleState.Enabled})),competitors:[{id:'competitor-1',name:'Comercio de muestra A',sku:products[0].sku,price:products[0].price+50000,history:[products[0].price+80000,products[0].price+50000],unread:false}],mlConnected:false };
  addOutletFixture(state); ensureMarketplace(state); return state;
}
/** Composition root: use cases own rules; this object supplies authorization and durable commits. */
export class DemoCommerce {
  private readonly adminPort = { snapshot: () => this.snapshot, requireAdmin: () => this.requireAdminAccess(this.session().actorId), commit: () => this.commit() };
  private readonly customers = new DemoCustomerCommands({snapshot:()=>this.snapshot,requireCustomer:id=>this.requireCustomerAccess(id),commit:()=>this.commit()});
  private readonly content = new DemoContentCommands(this.adminPort);
  private readonly configuration = new DemoConfigurationCommands(this.adminPort);
  private readonly campaigns = new DemoCampaignCommands({...this.adminPort,requireCatalog:()=>this.requireModule(DemoModuleId.Catalog)});
  private readonly campaignQuote = new DemoCampaignQuote(()=>this.snapshot,()=>this.now());
  readonly catalog = new DemoCatalogQuery(() => this.snapshot, (product,variant) => ({amount:this.quote(product.sku,variant.price)}));
  readonly catalogCommands = new DemoCatalogCommands({catalog:this.catalog,snapshot:()=>this.snapshot,requireCatalogAccess:id=>this.requireAdminAccess(id),requireModule:id=>this.requireModule(id),commit:stock=>this.commit(stock)});
  readonly cart = new DemoCartCommands({catalog:this.catalog,snapshot:()=>this.snapshot,actor:id=>this.actor(id),requireCustomerAccess:id=>this.requireCustomerAccess(id),requirePaymentAccess:(id,order)=>this.requirePaymentAccess(id,order),requireModule:id=>this.requireModule(id),commit:stock=>this.commit(stock),now:()=>this.now(),id:()=>this.id(),paymentPending:order=>{ensureFulfillment(order);},paymentResolved:order=>{ensureFulfillment(order).phase=ensureFulfillment(order).phase.refresh(order);}});
  readonly postSale = new DemoPostSaleCommands({catalog:this.catalog,snapshot:()=>this.snapshot,requireCustomerAccess:id=>this.requireCustomerAccess(id),requireAdminAccess:id=>this.requireAdminAccess(id),commit:stock=>this.commit(stock),now:()=>this.now(),id:()=>this.id()});
  constructor(public snapshot: DemoSnapshot = demoSeed(), private readonly now: () => string = () => new Date().toISOString(), private readonly id: () => string = () => crypto.randomUUID(), private readonly session: () => DemoSession = () => ({actorId:'',context:DemoContext.Unknown})) {}
  requireCustomerAccess(id: string): void { const session=this.session(); if(session.actorId!==id||session.context!==DemoContext.Customer||this.actor(id).role!==DemoRole.Customer) throw new Error('La operación requiere una sesión de comprador propia.'); }
  requireAdminAccess(id: string): void { const session=this.session(); if(session.actorId!==id||session.context!==DemoContext.Admin||this.actor(id).role!==DemoRole.Admin) throw new Error('La operación requiere una sesión de administración autorizada.'); }
  private requirePaymentAccess(id:string,order:CheckoutOrder):void { if(this.session().context===DemoContext.Admin) this.requireAdminAccess(id); else {this.requireCustomerAccess(id);if(order.actor!==id)throw new Error('El pedido pertenece a otro comprador.');} }
  private commit(projectStock=false):void {this.snapshot.revision++;this.snapshot.version=6;if(projectStock)ensureMarketplace(this.snapshot,this.now());this.queueStock();}
  private queueStock():void {ensureMarketplace(this.snapshot,this.now());new DemoMarketplaceProjection().refresh(this.snapshot,this.now());this.snapshot.syncJobs=this.snapshot.marketplace!.queue.map(job=>({id:job.id,sku:this.snapshot.marketplace!.mappings.find(mapping=>mapping.id===job.mappingId)!.sku,desired:job.desired,status:job.status,created:job.created}));}
  private requireModule(id:DemoModuleId):void {if(id===DemoModuleId.Unknown||!this.snapshot.modules.some(module=>module.id===id&&module.state.enabled))throw new Error(`${id.label} está pausado en la demostración. Habilitalo desde Módulos del comercio.`);}
  actor(id:string):DemoActor {const actor=this.snapshot.actors.find(value=>value.id===id);if(!actor)throw new Error('Elegí una identidad de demostración.');return actor;}
  product(sku:string):DemoProduct{return this.catalog.product(sku);}
  variants(sku:string):DemoProductVariantRecord[]{return this.product(sku).variants;}
  available(sku:string,variantId?:string):number{return this.catalog.available(sku,variantId);}
  private quote(sku:string,price:number):number {return this.campaignQuote.amount(sku,price);}
  price(sku:string,variantId?:string):number{return this.catalog.price(sku,variantId);}
  variantPrice(sku:string,variantId:string):number{return this.price(sku,variantId);}
  variantAvailable(sku:string,variantId:string):number{return this.available(sku,variantId);}
  setQuantity(actorId:string,sku:string,quantity:number,variantId:string):void{this.cart.setQuantity(actorId,sku,variantId,quantity);}
  add(actorId:string,sku:string,quantity:number,variantId:string):void{this.cart.add(actorId,sku,quantity,variantId);}
  remove(actorId:string,sku:string,variantId:string):void{this.cart.remove(actorId,sku,variantId);}
  refreshCart(actorId:string):void{this.cart.confirmQuote(actorId);}
  needsReconfirmation(actorId:string):boolean{return this.cart.needsReconfirmation(actorId);}
  retryOrder(actorId:string,orderId:string):void {
    this.requireCustomerAccess(actorId);
    const order=this.snapshot.orders.find(value=>value.id===orderId&&value.actor===actorId);
    if(!order||![PaymentStatus.Rejected,PaymentStatus.Cancelled].includes(order.payment))throw new Error('Solo podés recuperar un pedido propio rechazado o cancelado.');
    const actor=this.actor(actorId);
    for(const line of order.lines){
      const existing=actor.cart.find(value=>value.sku===line.sku&&value.variantId===line.variantId);
      if(!this.product(line.sku).publication.published||!this.catalog.variant(line.sku,line.variantId).saleState.active||this.available(line.sku,line.variantId)<line.quantity+(existing?.quantity??0))throw new Error('Revisá la disponibilidad de las variantes antes de recuperar el pedido.');
      if(existing&&existing.quotedUnit!==line.unit)throw new Error('El carrito ya contiene esta variante con otra cotización; revisalo antes de recuperar el pedido.');
    }
    for(const line of order.lines){
      const existing=actor.cart.find(value=>value.sku===line.sku&&value.variantId===line.variantId);
      if(existing)existing.quantity+=line.quantity;else actor.cart.push({sku:line.sku,variantId:line.variantId,quantity:line.quantity,quotedUnit:line.unit});
    }
    this.commit();
  }
  favorite(actorId:string,sku:string):void{this.requireCustomerAccess(actorId);this.product(sku);const actor=this.actor(actorId);actor.favorites=actor.favorites.includes(sku)?actor.favorites.filter(value=>value!==sku):[...actor.favorites,sku];this.commit();}
  saveProfile(actorId:string,draft:{firstName:string;lastName:string;phone:string}):void {this.customers.saveProfile(actorId,draft);}
  saveAddress(actorId:string,draft:DemoAddress):void {this.customers.saveAddress(actorId,draft);}
  deleteAddress(actorId:string,id:string):void {this.customers.deleteAddress(actorId,id);}
  primaryAddress(actorId:string,id:string):void {this.customers.primaryAddress(actorId,id);}
  saveContent(title:string,subtitle:string,blocks:readonly DemoContentBlock[]):void {this.content.save(title,subtitle,blocks);}
  setModule(id:DemoModuleId):void {this.configuration.toggle(id);}
  importProfile(title:string):void {this.saveContent(title,this.snapshot.subtitle,this.snapshot.blocks);}
  checkout(actorId:string,request:string,addressId:string,scenario:DemoScenario,method:DemoPaymentMethod,deliveryMethod:DemoDeliveryMethod):DemoOrder{
    const repeated=this.snapshot.orders.some(order=>order.actor===actorId&&order.request===request);
    const order=this.cart.checkout(actorId,request,addressId,scenario,method,deliveryMethod);
    if(repeated)return order;
    const fulfillment=ensureFulfillment(order),actor=this.actor(actorId);
    fulfillment.recipient=`${actor.firstName} ${actor.lastName}`;fulfillment.phone=actor.phone;
    if(deliveryMethod===DemoDeliveryMethod.Pickup&&order.delivery?.destination===DEMO_PICKUP_DESTINATION)Object.assign(fulfillment,DEMO_PICKUP_POINT);
    return order;
  }
  resolvePayment(orderId:string,scenario:DemoScenario):void{this.cart.resolvePayment(this.session().actorId,orderId,scenario);}
  cancelPayment(orderId:string):void{this.cart.cancelPayment(this.session().actorId,orderId);}
  saveProduct(product:DemoProduct,editingSku?:string,expectedRevision=this.snapshot.revision):void{this.catalogCommands.saveProduct(this.session().actorId,product,editingSku,expectedRevision);}
  saveProductFor(actorId:string,product:DemoProduct,editingSku?:string,expectedRevision=this.snapshot.revision):void{this.catalogCommands.saveProduct(actorId,product,editingSku,expectedRevision);}
  adjust(sku:string,delta:number,reason:string,variantId:string):void{
    this.requireAdminAccess(this.session().actorId);this.requireModule(DemoModuleId.Catalog);
    const product=this.product(sku),variant=this.catalog.variant(sku,variantId);
    if(!DemoProductPolicy.known(product))throw new Error('El inventario contiene estados desconocidos; requiere conciliación.');
    if(!Number.isInteger(delta)||!reason.trim()||variant.onHand+delta<variant.reserved+variant.notSellable)throw new Error('Indicá unidades enteras y motivo; el stock no puede ser menor a las reservas y unidades no vendibles.');
    DemoProductPolicy.variant({...variant,onHand:variant.onHand+delta});
    variant.onHand+=delta;this.catalog.refreshTotals(product);this.snapshot.movements.push({id:this.id(),sku,variantId,delta,reason});this.commit(true);
  }
  mlSale(sku:string,operation:string,variantId?:string):void{this.requireAdminAccess(this.session().actorId);this.requireModule(DemoModuleId.MercadoLibre);const candidates=ensureMarketplace(this.snapshot).mappings.filter(value=>value.sku===sku&&value.status.eligible);if(variantId===undefined){if(candidates.length!==1)throw new Error('Seleccioná una identidad de variante explícita.');variantId=candidates[0].variantId;}const changed=new DemoMarketplaceSale().apply({snapshot:this.snapshot,movements:this.snapshot.movements,consume:(selectedSku,id)=>{const variant=this.catalog.variant(selectedSku,id);if(this.catalog.available(selectedSku,id)<1)throw new Error('Variante sin stock.');variant.onHand--;this.catalog.refreshTotals(this.product(selectedSku));}},sku,operation,this.now(),variantId);if(changed)this.commit(true);}
  reportIncident(orderId: string, reason: string): void { const order = this.snapshot.orders.find(value => value.id === orderId); if(order)this.requirePaymentAccess(this.session().actorId,order); if (!order || order.payment !== PaymentStatus.Approved || !reason.trim()) throw new Error('Indicá una incidencia para un pedido aprobado.'); const fulfillment = new DemoFulfillmentPolicy().requireWritable(order); if (fulfillment.incident !== DemoIncidentKind.None) throw new Error('Resolvé la incidencia pendiente antes de abrir otra.'); fulfillment.incident = DemoIncidentKind.Report; fulfillment.incidentText = reason.trim(); order.incident = reason.trim(); order.history.push(`Incidencia: ${order.incident} · ${this.now()}`); this.commit(); }
  resolveIncident(orderId: string, note: string): void { this.requireAdminAccess(this.session().actorId); const order = this.snapshot.orders.find(value => value.id === orderId); if (!order?.incident) throw new Error('Coordiná el nuevo intento o plazo desde seguimiento.'); const fulfillment = new DemoFulfillmentPolicy().requireWritable(order); if (fulfillment.incident !== DemoIncidentKind.Report) throw new Error('Coordiná el nuevo intento o plazo desde seguimiento.'); if (!note.trim()) throw new Error('Escribí una respuesta al comprador antes de resolver la consulta.'); fulfillment.incident = DemoIncidentKind.None; fulfillment.incidentText = ''; fulfillment.resolution = note.trim(); order.incident = ''; order.history.push(`Incidencia resuelta · ${note.trim()} · ${this.now()}`); this.commit(); }
  configureFulfillment(orderId: string, draft: DemoFulfillment): void { this.requireAdminAccess(this.session().actorId); const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no disponible.'); new DemoFulfillmentPolicy().configure(order, draft); order.history.push(`Datos de entrega actualizados · ${this.now()}`); this.commit(); }
  fulfill(orderId: string, action: DemoFulfillmentAction, note = '', pickupDeadline?: string): void { this.requireAdminAccess(this.session().actorId); this.requireModule(DemoModuleId.Shipping); const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no disponible.'); const event = new DemoFulfillmentPolicy().apply(order, action, note, pickupDeadline); if (!event) return; if (action === DemoFulfillmentAction.Dispatch) order.tracking = `${this.snapshot.settings.trackingPrefix}-${order.id}`; order.history.push(`${event} · ${this.now()}`); this.commit(); }
  advance(orderId: string): void { this.requireAdminAccess(this.session().actorId); const order = this.snapshot.orders.find(value => value.id === orderId); if (!order) throw new Error('Pedido no disponible.'); const action = new DemoFulfillmentPolicy().actions(order)[0]; if (!action) throw new Error('La entrega no puede avanzar.'); this.fulfill(orderId, action); }
  processStock(fail = false): void {
    this.requireAdminAccess(this.session().actorId); this.requireModule(DemoModuleId.MercadoLibre); new DemoMarketplaceProcessor().process(this.snapshot, this.now(), fail);
    this.snapshot.syncJobs = ensureMarketplace(this.snapshot).queue.map(job => ({ id: job.id, sku: this.snapshot.marketplace!.mappings.find(mapping => mapping.id === job.mappingId)!.sku, desired: job.desired, status: job.status, created: job.created }));
    this.commit();
  }
  setMLAccount(status: DemoMLAccountStatus): void { this.requireAdminAccess(this.session().actorId); this.requireModule(DemoModuleId.MercadoLibre); const market = ensureMarketplace(this.snapshot, this.now()); if (status === DemoMLAccountStatus.Unknown || market.account === DemoMLAccountStatus.Unknown) throw new Error('Cuenta desconocida; restablecé la demostración.'); market.account = status; market.accountAt = this.now(); new DemoMarketplaceProjection().refresh(this.snapshot, this.now()); this.commit(); }
  mapML(sku: string, variantId: string, listingId: string, variationId: string): void { this.requireAdminAccess(this.session().actorId); this.requireModule(DemoModuleId.MercadoLibre); new DemoMarketplaceMapping().save(this.snapshot, sku, variantId, listingId, variationId, this.now()); if (!this.snapshot.listings.some(value => value.sku === sku)) this.snapshot.listings.push({ sku, linked: true, observed: 0, error: false }); new DemoMarketplaceProjection().refresh(this.snapshot, this.now()); this.commit(); }
  unlinkML(id: string): void { this.requireAdminAccess(this.session().actorId); this.requireModule(DemoModuleId.MercadoLibre); new DemoMarketplaceMapping().unlink(this.snapshot, id); new DemoMarketplaceProjection().refresh(this.snapshot, this.now()); this.commit(); }
  watchCompetitor(name: string, sku: string, threshold: number): void { this.requireAdminAccess(this.session().actorId); this.product(sku); if (!name.trim() || !Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new Error('Indicá nombre, producto y umbral entre 1 y 100%.'); this.snapshot.competitors.push({ id: this.id(), name: name.trim(), sku, threshold, enabled: true, price: this.price(sku), history: [this.price(sku)], unread: false }); this.commit(); }
  competitorAvailability(id: string, target: import('./demo-marketplace').DemoObservationStatus): void { this.requireAdminAccess(this.session().actorId); new DemoCompetitorAvailabilityStep().apply(this.snapshot, id, target); this.commit(); }
  competitorPrice(id: string, price: number, operation = this.id()): void { this.requireAdminAccess(this.session().actorId); new DemoCompetitorObservationStep().apply(this.snapshot, id, price, operation, this.now()); this.commit(); }
  saveSettings(settings: DemoSettings): void {this.configuration.save(settings);}
  saveCampaign(campaign:DemoCampaign):void{this.campaigns.save(campaign);}
  touch():void{const session=this.session();if(session.context===DemoContext.Admin)this.requireAdminAccess(session.actorId);else this.requireCustomerAccess(session.actorId);this.commit();}
}
