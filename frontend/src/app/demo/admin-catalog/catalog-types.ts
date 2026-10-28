export class ProductPublication {
  private constructor(readonly wire:string,readonly label:string,readonly active:boolean|null,readonly actionLabel:string,readonly effect:string){}
  static readonly Published=new ProductPublication('published','Publicado',true,'Archivar','Se vuelve a ofrecer en la tienda. Publicar un producto agotado no crea existencias.');
  static readonly Archived=new ProductPublication('archived','Archivado',false,'Publicar','Se retira de la tienda sin eliminar stock ni históricos. No se permite si tiene reservas pendientes.');
  static readonly Unknown=new ProductPublication('','Publicación no reconocida',null,'Acción no disponible','No se permiten cambios con un estado no reconocido.');
  static readonly all=[this.Published,this.Archived];
  static fromWire(raw:unknown):ProductPublication{return this.all.find(value=>value.wire===raw||value.active===raw)??this.Unknown;}
  next():ProductPublication{return this===ProductPublication.Published?ProductPublication.Archived:this===ProductPublication.Archived?ProductPublication.Published:ProductPublication.Unknown;}
}
export class CatalogAvailability {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Available=new CatalogAvailability('available','Con stock');static readonly Low=new CatalogAvailability('low','Stock bajo');static readonly Empty=new CatalogAvailability('empty','Agotado');static readonly Archived=new CatalogAvailability('archived','No ofrecido para venta');static readonly Unknown=new CatalogAvailability('','Saldo no interpretable');static readonly all=[this.Available,this.Low,this.Empty,this.Archived];
  static fromWire(raw:unknown):CatalogAvailability{return this.all.find(value=>value.wire===raw)??this.Unknown;}
  static resolve(publication:ProductPublication,available:number|null,threshold:number):CatalogAvailability{return publication===ProductPublication.Unknown||available===null?this.Unknown:publication===ProductPublication.Archived?this.Archived:available===0?this.Empty:available<threshold?this.Low:this.Available;}
}
export class CatalogPriceSource {
  private constructor(readonly label:string){}static readonly Base=new CatalogPriceSource('Precio base actual; sin descuento aplicado');static readonly Offer=new CatalogPriceSource('Oferta aplicada al precio actual');static readonly Unknown=new CatalogPriceSource('Precio aplicado no interpretable');static readonly all=[this.Base,this.Offer];static fromWire(raw:unknown):CatalogPriceSource{return this.all.find(value=>value.label===raw)??this.Unknown;}
  static resolve(base:number,current:number|null):CatalogPriceSource{return current===null?this.Unknown:current<base?this.Offer:this.Base;}
}
export class CatalogPublicationFilter {
  private constructor(readonly wire:string,readonly label:string,readonly publication:ProductPublication|null){}
  static readonly All=new CatalogPublicationFilter('all','Todos los estados',null);
  static readonly Published=new CatalogPublicationFilter('published','Publicados',ProductPublication.Published);
  static readonly Archived=new CatalogPublicationFilter('archived','Archivados',ProductPublication.Archived);
  static readonly Unknown=new CatalogPublicationFilter('','Filtro no reconocido',ProductPublication.Unknown);
  static readonly all=[this.All,this.Published,this.Archived];
  static fromWire(raw:unknown):CatalogPublicationFilter{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CatalogStockFilter {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly All=new CatalogStockFilter('all','Todas las disponibilidades');static readonly Available=new CatalogStockFilter('available','Con stock');static readonly Low=new CatalogStockFilter('low','Stock bajo');static readonly Empty=new CatalogStockFilter('empty','Agotados');static readonly Unknown=new CatalogStockFilter('','Disponibilidad no reconocida');
  static readonly all=[this.All,this.Available,this.Low,this.Empty];static fromWire(raw:unknown):CatalogStockFilter{return this.all.find(value=>value.wire===raw)??this.Unknown;}
  matches(available:number|null,publication:ProductPublication,threshold:number):boolean{return this===CatalogStockFilter.All||publication===ProductPublication.Published&&available!==null&&(this===CatalogStockFilter.Available&&available>0||this===CatalogStockFilter.Low&&available>0&&available<threshold||this===CatalogStockFilter.Empty&&available===0);}
}
export class CatalogDialog {
  private constructor(readonly label:string){}static readonly None=new CatalogDialog('Sin diálogo');static readonly Editor=new CatalogDialog('Editar producto');static readonly Publication=new CatalogDialog('Cambiar publicación');static readonly Discard=new CatalogDialog('Descartar cambios');static readonly Preview=new CatalogDialog('Vista previa de producto');static readonly Unknown=new CatalogDialog('Diálogo no reconocido');static readonly all=[this.None,this.Editor,this.Publication,this.Discard,this.Preview];static fromWire(raw:unknown):CatalogDialog{return this.all.find(value=>value.label===raw)??this.Unknown;}
}
export class CatalogIssue {
  private constructor(readonly label:string,readonly field:string){}
  static readonly None=new CatalogIssue('','');static readonly Authority=new CatalogIssue('El acceso cambió o el módulo no está habilitado.','catalog-error');static readonly Conflict=new CatalogIssue('El producto cambió. Cerrá el editor y revisá los datos antes de reintentar.','catalog-error');static readonly SKU=new CatalogIssue('Indicá un SKU único de hasta 64 letras, números, puntos, guiones o guiones bajos.','catalog-sku');static readonly Name=new CatalogIssue('Completá el nombre del producto (hasta 160 caracteres).','catalog-name');static readonly Brand=new CatalogIssue('Completá la marca (hasta 80 caracteres).','catalog-brand');static readonly Category=new CatalogIssue('Completá la categoría (hasta 80 caracteres).','catalog-category');static readonly Description=new CatalogIssue('La descripción admite hasta 2000 caracteres.','catalog-description');static readonly Base=new CatalogIssue('Ingresá un precio base positivo con hasta 2 decimales, dentro del rango admitido.','catalog-base');static readonly Original=new CatalogIssue('El precio de lista debe ser mayor o igual al precio base, antes de ofertas.','catalog-original');static readonly Stock=new CatalogIssue('Las existencias y reservas deben ser enteros seguros y coherentes.','catalog-error');static readonly Reserved=new CatalogIssue('No se puede archivar un producto con reservas pendientes.','catalog-error');static readonly Case=new CatalogIssue('No se puede quitar esta presentación mientras un carrito o reserva la utiliza.','catalog-case');static readonly Unknown=new CatalogIssue('El producto tiene datos no reconocidos. No se guardaron cambios.','catalog-error');
  static readonly all=[this.None,this.Authority,this.Conflict,this.SKU,this.Name,this.Brand,this.Category,this.Description,this.Base,this.Original,this.Stock,this.Reserved,this.Case];static fromWire(raw:unknown):CatalogIssue{return this.all.find(value=>value.label===raw)??this.Unknown;}
}
export class CatalogValidationError extends Error {constructor(readonly issue:CatalogIssue){super(issue.label);}}
