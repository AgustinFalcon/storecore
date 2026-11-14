import { mapProductDetail, mapProductSummary } from './http-mappers';
import { catalogProductDraftFromDetail } from '../../domain/catalog/catalog-product-draft';
import { CatalogPriceKind, CatalogPricePresentation, isArsAmount, parseArsAmountInput, SkuPriceResolution, VariantPriceCommand, VariantPricePolicy } from '../../domain/catalog/variant-price';

const quote = (base: number, effective = base, offer: {id:string;name:string} | null = null) => ({state:'KNOWN',price:{base,original:base,effective,offer}});
const variant = (sku: string, amount: number, status = 'ACTIVE') => ({id:sku,sku,name:sku,status,attributes:{},
  pricePolicy:{mode:'OVERRIDE',base:amount},price:quote(amount),availability:'UNAVAILABLE', inventory:{sku,state:'MISSING',available:null,reserved:null,safety:null,onHand:null,saleable:null}});
const product = (...variants: unknown[]) => ({id:'P',sku:'A',name:'Producto',status:'ACTIVE',productBasePrice:100,price:quote(100).price,variants});

describe('variant WEB price authority', () => {
  it('rejects raw monetary lexemes before JavaScript can round them', () => {
    expect(parseArsAmountInput('120000.25')).toBe(120000.25);
    expect(parseArsAmountInput('1.0000000000000001')).toBeNull();
    expect(parseArsAmountInput('999999999999.99001')).toBeNull();
  });
  it('translates closed policies/commands and validates exact money without rounding', () => {
    expect(VariantPricePolicy.fromWire('future')).toBe(VariantPricePolicy.Unknown);
    expect(VariantPriceCommand.fromWire('future')).toBe(VariantPriceCommand.Unknown);
    expect(VariantPriceCommand.fromWire('PRESERVE')).toBe(VariantPriceCommand.Preserve);
    expect(VariantPriceCommand.Inherit.toWire(null)).toEqual({mode:VariantPriceCommand.Inherit.wire});
    expect(VariantPriceCommand.Override.toWire(0)).toEqual({mode:VariantPriceCommand.Override.wire,base:0});
    for (const invalid of [null, '', '1.00', true, -1, 1.005, Infinity, NaN, 1000000000000]) {
      expect(isArsAmount(invalid)).toBe(false);
      expect(() => VariantPriceCommand.Override.toWire(invalid)).toThrow();
    }
    expect(isArsAmount(999999999999.99)).toBe(true);
  });
  it('fails closed for missing/future/contradictory quotes and never uses a parent fallback', () => {
    for (const raw of [undefined, {}, {state:'FUTURE',price:quote(10).price}, quote(10,9), quote(10,11,{id:'O',name:'Oferta'}), quote(-1)]) {
      expect(SkuPriceResolution.fromWire(raw)).toBe(SkuPriceResolution.Unknown);
    }
    const missing = {...variant('A',200),price:undefined};
    expect(mapProductDetail(product(missing)).variants[0].price).toBe(SkuPriceResolution.Unknown);
    expect(mapProductSummary(product(missing)).presentation).toBe(CatalogPricePresentation.Unknown);
    expect(mapProductDetail(product({...variant('A',200),price:quote(100)})).variants[0].price).toBe(SkuPriceResolution.Unknown);
    expect(mapProductDetail(product({...variant('A',200),pricePolicy:undefined})).variants[0].pricePolicy).toBe(VariantPricePolicy.Unknown);
  });
  it('summarizes all active variants independently of stock and navigates to the coherent minimum', () => {
    const a=variant('A',300), b={...variant('B',200),price:quote(200,150,{id:'O',name:'Oferta'})};
    const summary=mapProductSummary(product(a,b,variant('CHEAPER-INACTIVE',1,'INACTIVE')));
    expect(summary.destinationSku).toBe('B');
    expect(summary.presentation?.kind).toBe(CatalogPriceKind.From);
    expect(summary.presentation?.quote).toEqual(quote(200,150,{id:'O',name:'Oferta'}).price);
    expect(summary).toMatchObject({price:150,originalPrice:200,offerRef:'O'});
    expect(mapProductSummary(product(variant('B',10),variant('A',10))).destinationSku).toBe('A');
    expect(mapProductSummary(product(variant('B',10),variant('A',10))).presentation?.kind).toBe(CatalogPriceKind.Exact);
    expect(mapProductSummary(product()).presentation).toBe(CatalogPricePresentation.Unknown);
    expect(mapProductSummary(product(a,{...b,price:{state:'UNKNOWN'}})).presentation).toBe(CatalogPricePresentation.Unknown);
  });
  it('keeps equal overrides explicit and separates the parent base from opened SKU money', () => {
    const detail=mapProductDetail({...product(variant('A',200),variant('B',100)),price:quote(200).price});
    const draft=catalogProductDraftFromDetail(detail);
    expect(draft.productBasePrice).toBe(100);
    expect(draft.variants[1].pricePolicy).toBe(VariantPricePolicy.Override);
    expect(draft.variants[1].basePriceOverride).toBe(100);
    expect(draft.variants.every(value=>value.priceCommand===VariantPriceCommand.Preserve)).toBe(true);
  });
});
