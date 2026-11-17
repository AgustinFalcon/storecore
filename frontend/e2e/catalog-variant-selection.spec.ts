import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const absentSchema = { revision: 1, state: 'ABSENT', cause: null, axes: [] };

test('PDP follows the requested SKU when the same product route is reused', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const envelope = (data: unknown) => ({ code: 200, data, message: null });
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/catalog/products/')) {
      const sku = path.split('/').at(-1);
      return route.fulfill({ json: envelope({ id: 'p', sku, name: 'Producto con variantes', status: 'ACTIVE', images: [], media: [],
        optionSchema: absentSchema,
        productBasePrice: 10, price: { base: 10, original: 10, effective: 10, offer: null },
        variants: ['A', 'B'].map(sku => ({ pricePolicy: {mode:'OVERRIDE',base:sku==='B'?20:10}, price:{state:'KNOWN',price:{base:sku==='B'?20:10,original:sku==='B'?20:10,effective:sku==='B'?20:10,offer:null}}, id: sku, sku, name: `Variante ${sku}`, status: 'ACTIVE', availability: 'AVAILABLE', optionValues: {}, attributes: {},
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
    const variants=['A','B'].map(sku=>{const saleable=sku==='A'?2:4;return {id:sku,sku,name:'Variante '+sku,status:'ACTIVE',optionValues:{},attributes:{},pricePolicy:{mode:'OVERRIDE',base:sku==='A'?300:200},price:{state:'KNOWN',price:price(sku==='A'?300:200,sku==='A'?300:150)},availability:'AVAILABLE',inventory:{sku,state:'KNOWN',available:saleable,reserved:0,safety:0,onHand:saleable,saleable}}});
    await page.route('**/api/v1/**',route=>{
      const path=new URL(route.request().url()).pathname;
      const product={id:'P',sku:path.endsWith('/B')?'B':'A',name:'Producto cotizado',status:'ACTIVE',optionSchema:absentSchema,productBasePrice:100,price:price(300,300),variants,images:[],media:[]};
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
    await page.locator('input[name=quantity]').fill('3');
    await page.locator('select[name=variant]').selectOption('A');
    await expect(page.locator('.sc-price--hero')).toContainText('300');await expect(page.locator('.sc-price__was')).toHaveCount(0);
    await expect(page.locator('input[name=quantity]')).toHaveValue('3');
    await expect(page.getByText(/supera el stock disponible \(2\)/)).toBeVisible();
    const purchase = page.locator('.sc-buybox button[type=submit]');
    await expect(purchase).toBeDisabled();
    await page.locator('input[name=quantity]').fill('2');
    await expect(purchase).toBeEnabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}

for (const width of [390, 768, 1440]) {
  test(`Select and Swatch remain coherent, accessible and responsive at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const envelope = (data: unknown) => ({ code: 200, data, message: null });
    const longAxisLabel = 'A'.repeat(80);
    const axes = [
      { code: 'size', label: longAxisLabel, presentation: 'SELECT', order: 0, values: [
        { code: 'm', label: 'Mediano', order: 0 }, { code: 'l', label: 'Grande', order: 1 },
      ] },
      { code: 'tone', label: 'Tono', presentation: 'SWATCH', order: 1, values: [
        { code: 'dark', label: 'Oscuro', order: 0, swatchColor: '#111111' }, { code: 'light', label: 'Claro', order: 1, swatchColor: null },
      ] },
      { code: 'material', label: 'Material', presentation: 'SELECT', order: 2, values: [
        { code: 'cotton', label: 'Algodón', order: 0 }, { code: 'steel', label: 'Acero', order: 1 },
      ] },
      { code: 'fit', label: 'Calce', presentation: 'SWATCH', order: 3, values: [
        { code: 'regular', label: 'Regular', order: 0, swatchColor: null }, { code: 'slim', label: 'Slim', order: 1, swatchColor: null },
      ] },
    ];
    const variant = (id: string, sku: string, optionValues: Record<string, string>, saleable: number) => ({ id, sku, name: sku, status: 'ACTIVE', availability: 'AVAILABLE', optionValues, attributes: {},
      pricePolicy: { mode: 'OVERRIDE', base: 100 }, price: { state: 'KNOWN', price: { base: 100, original: 100, effective: 100, offer: null } },
      inventory: { variantId: id, sku, state: 'KNOWN', available: saleable, reserved: 0, safety: 0, onHand: saleable, saleable } });
    const product = { id: 'P', sku: 'SKU-M-DARK', name: 'Remera configurable', status: 'ACTIVE', productBasePrice: 100, images: [], media: [],
      optionSchema: { revision: 1, state: 'VALID', cause: null, axes }, variants: [
        variant('1', 'SKU-M-DARK', { size: 'm', tone: 'dark', material: 'cotton', fit: 'regular' }, 10),
        variant('2', 'SKU-L-LIGHT', { size: 'l', tone: 'light', material: 'steel', fit: 'slim' }, 2),
      ] };
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path.includes('/catalog/products/')) return route.fulfill({ json: envelope(product) });
      if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
      if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
      return route.fulfill({ status: 401, json: {} });
    });
    await page.goto('/catalog/SKU-M-DARK');
    const quantity = page.locator('input[name=quantity]');
    expect(await quantity.evaluate(input => (input as HTMLInputElement).labels?.length)).toBe(1);
    await quantity.fill('3');
    const size = page.getByLabel(longAxisLabel);
    await size.selectOption('l');
    await expect(quantity).toHaveValue('3');
    await expect(page.getByText('Completá las opciones para conocer el SKU')).toBeVisible();
    let axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
    const light = page.getByRole('radio', { name: /Claro/ });
    await size.press('Tab');
    await expect(light).toBeFocused();
    await page.keyboard.press('Space');
    await expect(light).toBeChecked();
    await page.getByLabel('Material').selectOption('steel');
    await page.getByLabel('Material').press('Tab');
    const slim = page.getByRole('radio', { name: /Slim/ });
    await expect(slim).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByText('SKU SKU-L-LIGHT')).toBeVisible();
    await expect(page.getByText(/supera el stock disponible \(2\)/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await size.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  });
}
