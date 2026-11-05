export class ItemCondition {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Unspecified=new ItemCondition('unspecified','Condición no informada');
  static readonly New=new ItemCondition('new','Nuevo');
  static readonly Reconditioned=new ItemCondition('reconditioned','Reacondicionado');
  static readonly Used=new ItemCondition('used','Usado');
  static readonly Unknown=new ItemCondition('','Condición no reconocida');
  static readonly all=[this.Unspecified,this.New,this.Reconditioned,this.Used];
  static fromWire(raw:unknown):ItemCondition{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CatalogMediaKind {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Illustration=new CatalogMediaKind('illustration','Ilustración Demo; no es fotografía real de la unidad');
  static readonly GeneratedImage=new CatalogMediaKind('generated-demo','Imagen fotorealista simulada para la demostración; reemplazar por foto real antes de publicar');
  static readonly Unknown=new CatalogMediaKind('','Origen de imagen no reconocido');
  static readonly all=[this.Illustration,this.GeneratedImage];
  static fromWire(raw:unknown):CatalogMediaKind{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CatalogDetailIssue {
  private constructor(readonly label:string,readonly field:string){}
  static readonly Media=new CatalogDetailIssue('Elegí al menos una imagen local registrada, sin duplicados, con texto alternativo de hasta 240 caracteres.','catalog-media-heading');
  static readonly Variant=new CatalogDetailIssue('Revisá las presentaciones: identidades únicas, precios positivos seguros y lista mayor o igual a base antes de ofertas.','catalog-variants-heading');
  static readonly State=new CatalogDetailIssue('Conservá al menos una presentación habilitada; los estados no reconocidos no permiten guardar ni comprar.','catalog-variants-heading');
  static readonly Reserved=new CatalogDetailIssue('Una presentación en carrito o reservada no se puede deshabilitar ni cambiar de condición.','catalog-variants-heading');
  static readonly Outlet=new CatalogDetailIssue('Outlet requiere SKU propio, unidad/lote identificado, condición, defectos, garantía e imágenes de su espécimen.','catalog-condition-heading');
  static readonly Stock=new CatalogDetailIssue('El pool de stock es sólo lectura y debe conservar físico, reservado y no vendible coherentes.','catalog-condition-heading');
  static readonly Conflict=new CatalogDetailIssue('El catálogo enriquecido cambió. Revisá la versión guardada antes de reintentar.','catalog-error');
  static readonly CaseBase=new CatalogDetailIssue('Ingresá una base Con estuche positiva, segura y con hasta dos decimales.','catalog-rich-case-base');
  static readonly CaseOriginal=new CatalogDetailIssue('Lista Con estuche debe ser un precio seguro mayor o igual a su base, antes de ofertas.','catalog-rich-case-original');
  static readonly Unknown=new CatalogDetailIssue('Los datos del catálogo no se reconocen. No se guardaron cambios.','catalog-error');
  static readonly all=[this.Media,this.Variant,this.State,this.Reserved,this.Outlet,this.Stock,this.Conflict,this.CaseBase,this.CaseOriginal];
  static fromWire(raw:unknown):CatalogDetailIssue{return this.all.find(value=>value.label===raw)??this.Unknown;}
}
export class CatalogDetailError extends Error {constructor(readonly issue:CatalogDetailIssue){super(issue.label);}}
export class CatalogPricingBasis {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly OwnBase=new CatalogPricingBasis('own-base','Base propia de la presentación; la oferta del SKU se calcula sobre esta base');
  static readonly LegacySurcharge=new CatalogPricingBasis('legacy-surcharge','Base del SKU con oferta, más adicional de presentación conservado del catálogo anterior');
  static readonly Unknown=new CatalogPricingBasis('','Cálculo de precio no reconocido');
  static readonly all=[this.OwnBase,this.LegacySurcharge];
  static fromWire(raw:unknown):CatalogPricingBasis{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
export class CatalogCompareAt {
  private constructor(readonly wire:string,readonly label:string){}
  static readonly Known=new CatalogCompareAt('known','Precio de lista informado');
  static readonly Unavailable=new CatalogCompareAt('unavailable','Precio de lista no disponible para esta presentación heredada');
  static readonly Unknown=new CatalogCompareAt('','Comparador no reconocido');
  static readonly all=[this.Known,this.Unavailable];
  static fromWire(raw:unknown):CatalogCompareAt{return this.all.find(value=>value.wire===raw)??this.Unknown;}
}
