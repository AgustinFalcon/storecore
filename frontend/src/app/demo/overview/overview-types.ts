import { UserRole } from '../../domain/user/user-role';
import { DemoContext,DemoModuleId,type DemoSnapshot } from '../demo-model';
import { DemoOrderDate,OrderDatePrecision } from '../orders/demo-order-date';

export class OverviewRange {
  private constructor(readonly wire:string,readonly label:string,readonly days:number|null){}
  static readonly All=new OverviewRange('all','Todo el historial',null);
  static readonly Week=new OverviewRange('7','Últimos 7 días',7);
  static readonly Month=new OverviewRange('30','Últimos 30 días',30);
  static readonly Unknown=new OverviewRange('','Período no reconocido',null);
  static readonly all=[this.All,this.Week,this.Month];
  static fromWire(raw:unknown):OverviewRange{return this.all.find(value=>value.wire===raw)??this.Unknown;}
  includes(date:DemoOrderDate,reference:DemoOrderDate):boolean{return this!==OverviewRange.Unknown&&(this===OverviewRange.All||this.days!==null&&date.withinDaysEndingAt(reference,this.days)===true);}
}
export class OverviewAccess {
  private constructor(readonly label:string){}
  static readonly Allowed=new OverviewAccess('Acceso autorizado');
  static readonly Denied=new OverviewAccess('Acceso no disponible');
  static readonly Unreadable=new OverviewAccess('Datos guardados no disponibles');
  static readonly Unknown=new OverviewAccess('Acceso no reconocido');
  static readonly all=[this.Allowed,this.Denied,this.Unreadable];
  static fromWire(raw:unknown):OverviewAccess{return this.all.find(value=>value.label===raw)??this.Unknown;}
  static resolve(context:DemoContext,role:UserRole,readable:boolean):OverviewAccess{return !readable?this.Unreadable:context===DemoContext.Admin&&role.isKnown?this.Allowed:this.Denied;}
}
export class OverviewTaskKind {
  private constructor(readonly label:string,readonly priority:number){}
  static readonly Incident=new OverviewTaskKind('Incidencia registrada',0);
  static readonly Review=new OverviewTaskKind('Datos del pedido por revisar',1);
  static readonly Pending=new OverviewTaskKind('Pago pendiente',2);
  static readonly Prepare=new OverviewTaskKind('Entrega por preparar',3);
  static readonly Shipping=new OverviewTaskKind('Entrega en curso',4);
  static readonly Unknown=new OverviewTaskKind('Atención no determinada',5);
  static readonly all=[this.Incident,this.Review,this.Pending,this.Prepare,this.Shipping];
  static fromWire(raw:unknown):OverviewTaskKind{return this.all.find(value=>value.label===raw)??this.Unknown;}
}
/** A navigation permission, not a command or grant for a destination. Mirrors current route authority. */
export class OverviewAction {
  private constructor(readonly id:string,readonly label:string,readonly path:string,readonly module:DemoModuleId|null,readonly operator=false){}
  static readonly Orders=new OverviewAction('dashboard-orders','Ver pedidos','/demo/user/orders',DemoModuleId.Checkout);
  static readonly Revenue=new OverviewAction('dashboard-revenue','Ver todos los pedidos','/demo/user/orders',DemoModuleId.Checkout);
  static readonly Payments=new OverviewAction('dashboard-alert-payments','Abrir listado de pedidos','/demo/user/orders',DemoModuleId.Checkout);
  static readonly Stock=new OverviewAction('dashboard-alert-stock','Revisar existencias','/demo/user/inventory',DemoModuleId.Catalog);
  static readonly LowStock=new OverviewAction('dashboard-low-stock','Ver inventario','/demo/user/inventory',DemoModuleId.Catalog);
  static readonly Inventory=new OverviewAction('dashboard-inventory','Gestionar inventario','/demo/user/inventory',DemoModuleId.Catalog);
  static readonly Products=new OverviewAction('dashboard-products','Gestionar productos','/demo/user/catalog',DemoModuleId.Catalog,true);
  static readonly Content=new OverviewAction('dashboard-content','Editar borrador de portada','/demo/user/content',null,true);
  static readonly Offers=new OverviewAction('dashboard-offers','Revisar ofertas','/demo/user/offers',DemoModuleId.Catalog);
  static readonly Customers=new OverviewAction('dashboard-customers','Consultar clientes','/demo/user/customers',null,true);
  static readonly Channel=new OverviewAction('dashboard-alert-channel','Revisar canal simulado','/demo/user/mercadolibre',DemoModuleId.MercadoLibre);
  static readonly Settings=new OverviewAction('dashboard-settings','Configuración','/demo/user/profile-import',null);
  static readonly Modules=new OverviewAction('dashboard-modules','Módulos del comercio','/demo/user/capabilities',null);
  static readonly all=[this.Orders,this.Revenue,this.Payments,this.Stock,this.LowStock,this.Inventory,this.Products,this.Content,this.Offers,this.Customers,this.Channel,this.Settings,this.Modules];
  permits(role:UserRole,snapshot:DemoSnapshot):boolean{return (role===UserRole.Admin||role===UserRole.Operator&&this.operator)&&(!this.module||OverviewAction.moduleEnabled(snapshot,this.module));}
  static moduleEnabled(snapshot:DemoSnapshot,id:DemoModuleId):boolean{const rows=snapshot.modules.filter(value=>value.id===id);return rows.length===1&&rows[0].enabled===true;}
  static orderPermitted(role:UserRole,snapshot:DemoSnapshot):boolean{return (role===UserRole.Admin||role===UserRole.Operator)&&this.moduleEnabled(snapshot,DemoModuleId.Checkout);}
}
export const overviewDateKnown=(date:DemoOrderDate)=>date.precision!==OrderDatePrecision.Unknown;
