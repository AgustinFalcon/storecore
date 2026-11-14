import { expect, test } from '@playwright/test';

test('PDP follows the requested SKU when the same product route is reused', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const envelope = (data: unknown) => ({ code: 200, data, message: null });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/catalog/products/')) {
      const sku = path.split('/').at(-1);
      return route.fulfill({ json: envelope({ id: 'p', sku, name: 'Producto con variantes', status: 'ACTIVE', images: [], media: [],
        productBasePrice: 10, price: { base: 10, original: 10, effective: 10, offer: null },
        variants: ['A', 'B'].map(sku => ({ pricePolicy: {mode:'OVERRIDE',base:sku==='B'?20:10}, price:{state:'KNOWN',price:{base:sku==='B'?20:10,original:sku==='B'?20:10,effective:sku==='B'?20:10,offer:null}}, id: sku, sku, name: `Variante ${sku}`, status: 'ACTIVE', availability: 'AVAILABLE', attributes: {},
          inventory: { variantId: sku, sku, state: 'KNOWN', available: 4, reserved: 1, safety: 1, onHand: 5, saleable: 3 } })) }) });
    }
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    return route.fulfill({ status: 401, json: {} });
  });
  await page.goto('/catalog/B');
  await expect(page.getByRole('heading', { name: 'Producto con variantes' })).toBeVisible();
  await expect(page.locator('select[name="variant"]')).toHaveValue('B');
  await expect(page.locator('.sc-price--hero')).toContainText('20');
  await page.locator('input[name="quantity"]').fill('2');
  await page.evaluate(() => { history.pushState({}, '', '/catalog/A'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('SKU A', { exact: true })).toBeVisible();
  await expect(page.locator('select[name="variant"]')).toHaveValue('A');
  await expect(page.locator('input[name="quantity"]')).toHaveValue('1');
});

for(const width of [390,1440]) {
  test('coherent minimum card and selected variant price at '+width, async ({page})=>{
    await page.setViewportSize({width,height:900});
    const envelope=(data:unknown)=>({code:200,data,message:null});
    const price=(base:number,effective:number)=>({base,original:base,effective,offer:effective<base?{id:'O',name:'Oferta'}:null});
    const variants=['A','B'].map(sku=>({id:sku,sku,name:'Variante '+sku,status:'ACTIVE',attributes:{},pricePolicy:{mode:'OVERRIDE',base:sku==='A'?300:200},price:{state:'KNOWN',price:price(sku==='A'?300:200,sku==='A'?300:150)},availability:'AVAILABLE',inventory:{sku,state:'KNOWN',available:4,reserved:0,safety:0,onHand:4,saleable:4}}));
    await page.route('**/api/v1/**',route=>{
      const path=new URL(route.request().url()).pathname;
      const product={id:'P',sku:path.endsWith('/B')?'B':'A',name:'Producto cotizado',status:'ACTIVE',productBasePrice:100,price:price(300,300),variants,images:[],media:[]};
      if(path==='/api/v1/catalog') return route.fulfill({json:envelope({items:[product],total:1,page:0,size:50,truncated:false})});
      if(path.includes('/catalog/products/')) return route.fulfill({json:envelope(product)});
      if(path.endsWith('/catalog/brands')||path.endsWith('/catalog/categories')) return route.fulfill({json:envelope([])});
      if(path.endsWith('/health')) return route.fulfill({json:envelope({status:'UP'})});
      return route.fulfill({status:401,json:{}});
    });
    await page.goto('/catalog');
    const tile=page.locator('sc-product-tile');
    await expect(tile).toContainText('Desde');await expect(tile).toContainText('150');await expect(tile.locator('.sc-price__was')).toHaveText('200');
    await tile.getByRole('link',{name:'Producto cotizado',exact:true}).last().click();
    await expect(page).toHaveURL(new RegExp('/catalog/B$'));
    await expect(page.locator('select[name=variant]')).toHaveValue('B');await expect(page.locator('.sc-price--hero')).toContainText('150');
    await page.locator('input[name=quantity]').fill('2');
    await page.locator('select[name=variant]').selectOption('A');
    await expect(page.locator('.sc-price--hero')).toContainText('300');await expect(page.locator('.sc-price__was')).toHaveCount(0);
    await expect(page.locator('input[name=quantity]')).toHaveValue('1');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}
