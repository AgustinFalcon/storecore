/** Ephemeral context accepts a closed origin, never a return URL. */
export class OrderNavigationOrigin {
 private constructor(readonly wire:string,readonly label:string){}
 static readonly Customers=new OrderNavigationOrigin('CUSTOMERS','Volver a clientes');
 static readonly Orders=new OrderNavigationOrigin('ORDERS','Volver a pedidos');
 static readonly Unknown=new OrderNavigationOrigin('','Volver a pedidos');
 static fromWire(raw:unknown):OrderNavigationOrigin{return [this.Customers,this.Orders].find(value=>value.wire===raw)??this.Unknown;}
 destination(customerId:string,orders:{path:string;params:object}){return this===OrderNavigationOrigin.Customers?{path:'/demo/user/customers',params:{focus:customerId||null}}:orders;}
}
