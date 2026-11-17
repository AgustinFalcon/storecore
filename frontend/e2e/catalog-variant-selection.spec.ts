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

test('simple product stays purchasable without a redundant selector and creates an explicit continuation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const envelope = (data: unknown) => ({ code: 200, data, message: null });
  let customer = false;
  const cartWrites: Array<Record<string, unknown>> = [];
  const unexpectedWrites: string[] = [];
  let cartLines: Array<Record<string, unknown>> = [];
  const product = {
    id: 'simple-product', sku: 'DRILL-SIMPLE', name: 'Taladro simple', description: 'Una sola presentación comercial',
    brand: 'Bosch', category: 'Taladros', status: 'ACTIVE', images: [], media: [], optionSchema: absentSchema,
    productBasePrice: 125000, price: { base: 125000, original: 125000, effective: 125000, offer: null },
    variants: [{ id: 'simple-variant', sku: 'DRILL-SIMPLE', name: 'Presentación única', status: 'ACTIVE', availability: 'AVAILABLE',
      optionValues: {}, attributes: { Marca: 'Bosch' }, pricePolicy: { mode: 'INHERITED', base: null },
      price: { state: 'KNOWN', price: { base: 125000, original: 125000, effective: 125000, offer: null } },
      inventory: { variantId: 'simple-variant', sku: 'DRILL-SIMPLE', state: 'KNOWN', available: 8, reserved: 0, safety: 0, onHand: 8, saleable: 8 } }],
  };
  await page.route('**/api/v1/**', route => {
    const request = route.request();
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/customer/me')) return customer
      ? route.fulfill({ json: envelope({ id: 'customer-1', email: 'buyer@example.test', firstName: 'Buyer', lastName: 'Test', phone: '' }) })
      : route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/internal/me')) return route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/customer/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/customer/cart/items') && request.method() === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>; cartWrites.push(body);
      cartLines = [{ sku: body['sku'], name: 'Taladro simple', quantity: body['quantity'], effectiveUnitPrice: 125000,
        originalUnitPrice: 125000, discountAmount: 0, offerRef: null, campaignRef: null }];
      return route.fulfill({ json: envelope({ revision: 'b'.repeat(64), currency: 'ARS', deliveryOptions: [], lines: cartLines }) });
    }
    if (path.endsWith('/customer/cart') && request.method() === 'GET') return route.fulfill({ json: envelope({ revision: 'a'.repeat(64), currency: 'ARS', deliveryOptions: [], lines: cartLines }) });
    if (path.endsWith('/customer/favorites') && request.method() === 'GET') return route.fulfill({ json: envelope([]) });
    if (path.includes('/catalog/products/') && request.method() === 'GET') return route.fulfill({ json: envelope(product) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (!['GET', 'HEAD'].includes(request.method())) { unexpectedWrites.push(`${request.method()} ${path}`); return route.fulfill({ status: 405, json: {} }); }
    return route.fulfill({ status: 401, json: {} });
  });

  await page.goto('/catalog/DRILL-SIMPLE');
  await expect(page.getByText('Marca')).toBeVisible();
  await expect(page.getByText('Bosch', { exact: true }).last()).toBeVisible();
  await expect(page.locator('select[name="variant"]')).toHaveCount(0);
  await page.locator('input[name="quantity"]').fill('3');
  const purchase = page.getByRole('button', { name: 'Entrar para agregar' });
  await expect(purchase).toBeEnabled();
  await purchase.click();
  await expect(page).toHaveURL(/\/login\?.*resume=/);
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('storecore.purchase-intent.v1') ?? '{}'));
  expect(stored.kind).toBe('ACTIVE');
  expect(stored.intent.productSku).toBe('DRILL-SIMPLE');
  expect(stored.intent.variantSku).toBe('DRILL-SIMPLE');
  expect(stored.intent.quantity).toBe(3);

  customer = true;
  await page.goto(`/catalog/DRILL-SIMPLE?resume=${stored.intent.flowId}`);
  await expect(page.locator('input[name="quantity"]')).toHaveValue('3');
  await expect(page.getByRole('button', { name: 'Confirmar cantidad final' })).toBeEnabled();
  expect(cartWrites).toHaveLength(0);
  await page.getByRole('button', { name: 'Confirmar cantidad final' }).click();
  await expect.poll(() => cartWrites.length).toBe(1);
  expect(cartWrites[0]).toEqual({ sku: 'DRILL-SIMPLE', quantity: 3 });
  await page.getByRole('link', { name: 'Ver carrito' }).click();
  const cartRow = page.getByRole('row').filter({ hasText: 'Taladro simple' });
  await expect(cartRow).toBeVisible();
  await expect(cartRow.getByText('3', { exact: true })).toBeVisible();
  expect(unexpectedWrites).toEqual([]);
});

test('non-cartesian choice keeps the compatible suffix and retires stale commercial identity', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  const envelope = (data: unknown) => ({ code: 200, data, message: null });
  const axes = ['a', 'b', 'c'].map((code, order) => ({ code, label: `Eje ${code.toUpperCase()}`, presentation: 'SELECT', order,
    values: [{ code: 'x', label: `${code.toUpperCase()} X`, order: 0 }, { code: 'y', label: `${code.toUpperCase()} Y`, order: 1 }] }));
  const variant = (id: string, sku: string, optionValues: Record<string, string>, amount: number) => ({ id, sku, name: sku,
    status: 'ACTIVE', availability: 'AVAILABLE', optionValues, attributes: {}, pricePolicy: { mode: 'OVERRIDE', base: amount },
    price: { state: 'KNOWN', price: { base: amount, original: amount, effective: amount, offer: null } },
    inventory: { variantId: id, sku, state: 'KNOWN', available: 10, reserved: 0, safety: 0, onHand: 10, saleable: 10 } });
  const product = { id: 'non-cartesian', sku: 'SKU-Y-Y-X', name: 'Producto no cartesiano', description: '', brand: 'StoreCore', category: 'Pruebas',
    status: 'ACTIVE', images: [], media: [], productBasePrice: 100, optionSchema: { revision: 4, state: 'VALID', cause: null, axes },
    variants: [variant('1', 'SKU-X-X-X', { a: 'x', b: 'x', c: 'x' }, 110), variant('2', 'SKU-Y-Y-X', { a: 'y', b: 'y', c: 'x' }, 220),
      variant('3', 'SKU-Y-X-Y', { a: 'y', b: 'x', c: 'y' }, 330)] };
  let customer = false;
  const cartWrites: Array<Record<string, unknown>> = [];
  const unexpectedWrites: string[] = [];
  await page.context().route('**/api/v1/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/customer/me')) return customer
      ? route.fulfill({ json: envelope({ id: 'customer-1', email: 'buyer@example.test', firstName: 'Buyer', lastName: 'Test', phone: '' }) })
      : route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/internal/me')) return route.fulfill({ status: 401, json: {} });
    if (path.endsWith('/customer/auth/csrf')) return route.fulfill({ json: envelope({}), headers: { 'X-CSRF-Token': 'csrf' } });
    if (path.endsWith('/customer/cart/items') && request.method() === 'PUT') {
      const body = request.postDataJSON() as Record<string, unknown>; cartWrites.push(body);
      return route.fulfill({ json: envelope({ revision: 'b'.repeat(64), currency: 'ARS', deliveryOptions: [], lines: [{
        sku: body['sku'], name: 'Producto no cartesiano', quantity: body['quantity'], effectiveUnitPrice: 110,
        originalUnitPrice: 110, discountAmount: 0, offerRef: null, campaignRef: null,
      }] }) });
    }
    if (path.endsWith('/customer/cart') && request.method() === 'GET') return route.fulfill({ json: envelope({ revision: 'a'.repeat(64), currency: 'ARS', deliveryOptions: [], lines: [] }) });
    if (path.endsWith('/customer/favorites') && request.method() === 'GET') return route.fulfill({ json: envelope([]) });
    if (path.includes('/catalog/products/') && request.method() === 'GET') return route.fulfill({ json: envelope(product) });
    if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
    if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
    if (!['GET', 'HEAD'].includes(request.method())) { unexpectedWrites.push(`${request.method()} ${path}`); return route.fulfill({ status: 405, json: {} }); }
    return route.fulfill({ status: 404, json: {} });
  });

  await page.goto('/catalog/SKU-Y-Y-X');
  await page.locator('input[name="quantity"]').fill('6');
  await page.getByRole('button', { name: 'Entrar para agregar' }).click();
  const oldRecord = await page.evaluate(() => JSON.parse(sessionStorage.getItem('storecore.purchase-intent.v1') ?? '{}'));
  const oldFlow = oldRecord.intent.flowId as string;
  customer = true;
  await page.goto(`/catalog/SKU-Y-Y-X?resume=${oldFlow}`);
  await expect(page.getByText('SKU SKU-Y-Y-X')).toBeVisible();
  await expect(page.locator('.sc-price--hero')).toContainText('220');
  await expect(page.locator('input[name="quantity"]')).toHaveValue('6');
  await expect(page.getByRole('button', { name: 'Confirmar cantidad final' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Guardar en favoritos/ })).toBeVisible();
  await page.getByLabel('Eje A').selectOption('x');
  await expect(page.getByLabel('Eje B')).toHaveValue('');
  await expect(page.getByLabel('Eje C')).toHaveValue('x');
  await expect(page.getByText('Completá las opciones para conocer el SKU')).toBeVisible();
  await expect(page.locator('.sc-price--hero')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /favoritos/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar al carrito' })).toBeDisabled();
  const retired = await page.evaluate(() => JSON.parse(sessionStorage.getItem('storecore.purchase-intent.v1') ?? '{}'));
  expect(retired).toEqual({ kind: 'RETIRED', flowId: oldFlow });
  await expect(page).not.toHaveURL(/resume=/);
  await page.evaluate(flow => {
    const url = new URL(location.href); url.searchParams.set('resume', flow);
    history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
  }, oldFlow);
  await expect(page).toHaveURL(new RegExp(`resume=${oldFlow}`));
  await expect(page.getByRole('button', { name: 'Confirmar cantidad final' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('storecore.purchase-intent.v1') ?? '{}'))).toEqual({ kind: 'RETIRED', flowId: oldFlow });
  expect(cartWrites).toHaveLength(0);
  await page.evaluate(() => {
    const url = new URL(location.href); url.searchParams.delete('resume');
    history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(flow => { window.open(`/catalog/SKU-Y-Y-X?resume=${flow}`, '_blank'); }, oldFlow);
  const retiredDocument = await popupPromise;
  await retiredDocument.waitForLoadState('domcontentloaded');
  await expect(retiredDocument.getByText('SKU SKU-Y-Y-X')).toBeVisible();
  await expect(retiredDocument.locator('input[name="quantity"]')).toHaveValue('1');
  await expect(retiredDocument.getByRole('button', { name: /Guardar en favoritos/ })).toBeVisible();
  await expect(retiredDocument.getByRole('button', { name: 'Agregar al carrito' })).toBeEnabled();
  await expect(retiredDocument.getByRole('button', { name: 'Confirmar cantidad final' })).toHaveCount(0);
  expect(await retiredDocument.evaluate(() => JSON.parse(sessionStorage.getItem('storecore.purchase-intent.v1') ?? '{}'))).toEqual({ kind: 'RETIRED', flowId: oldFlow });
  expect(cartWrites).toHaveLength(0);
  await retiredDocument.close();

  await page.getByLabel('Eje B').selectOption('x');
  await expect(page.getByText('SKU SKU-X-X-X')).toBeVisible();
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  const fresh = await page.evaluate(() => JSON.parse(sessionStorage.getItem('storecore.purchase-intent.v1') ?? '{}'));
  expect(fresh.kind).toBe('ACTIVE');
  expect(fresh.intent.flowId).not.toBe(oldFlow);
  expect(cartWrites).toHaveLength(0);

  await page.goto(`/catalog/SKU-Y-Y-X?resume=${oldFlow}`);
  await expect(page.locator('input[name="quantity"]')).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Confirmar cantidad final' })).toHaveCount(0);
  expect(cartWrites).toHaveLength(0);

  await page.goto(`/catalog/SKU-Y-Y-X?resume=${fresh.intent.flowId}`);
  await expect(page.getByText('SKU SKU-X-X-X')).toBeVisible();
  await expect(page.locator('input[name="quantity"]')).toHaveValue('6');
  await page.getByRole('button', { name: 'Confirmar cantidad final' }).click();
  await expect.poll(() => cartWrites.length).toBe(1);
  expect(cartWrites[0]).toEqual({ sku: 'SKU-X-X-X', quantity: 6 });
  expect(unexpectedWrites).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const width of [390, 768, 1440]) {
  test(`zero, one and two option axes remain complete and responsive at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const envelope = (data: unknown) => ({ code: 200, data, message: null });
    const price = { base: 100, original: 100, effective: 100, offer: null };
    const variant = (sku: string, values: Record<string, string>) => ({ id: `${sku}-id`, sku, name: sku, status: 'ACTIVE', availability: 'AVAILABLE', optionValues: values,
      attributes: {}, pricePolicy: { mode: 'OVERRIDE', base: 100 }, price: { state: 'KNOWN', price },
      inventory: { variantId: `${sku}-id`, sku, state: 'KNOWN', available: 5, reserved: 0, safety: 0, onHand: 5, saleable: 5 } });
    const base = (sku: string, name: string) => ({ id: sku, sku, name, description: '', brand: 'StoreCore', category: 'Matriz', status: 'ACTIVE', images: [], media: [], productBasePrice: 100, price });
    const products: Record<string, unknown> = {
      ZERO: { ...base('ZERO', 'Sin opciones'), optionSchema: absentSchema, variants: [variant('ZERO', {})] },
      ONE: { ...base('ONE-M', 'Un eje'), optionSchema: { revision: 1, state: 'VALID', cause: null, axes: [{ code: 'size', label: 'Tamaño', presentation: 'SELECT', order: 0,
        values: [{ code: 'm', label: 'Mediano', order: 0 }, { code: 'l', label: 'Grande', order: 1 }] }] }, variants: [variant('ONE-M', { size: 'm' })] },
      TWO: { ...base('TWO-M-DARK', 'Dos ejes'), optionSchema: { revision: 1, state: 'VALID', cause: null, axes: [
        { code: 'size', label: 'Tamaño', presentation: 'SELECT', order: 0, values: [{ code: 'm', label: 'Mediano', order: 0 }] },
        { code: 'tone', label: 'Tono', presentation: 'SWATCH', order: 1, values: [{ code: 'dark', label: 'Oscuro', order: 0, swatchColor: '#111111' }] },
      ] }, variants: [variant('TWO-M-DARK', { size: 'm', tone: 'dark' })] },
    };
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname;
      const key = path.split('/').at(-1) ?? '';
      if (path.endsWith('/customer/me') || path.endsWith('/internal/me')) return route.fulfill({ status: 401, json: {} });
      if (path.includes('/catalog/products/')) return route.fulfill({ json: envelope(key === 'ZERO' ? products['ZERO'] : key === 'ONE-M' ? products['ONE'] : products['TWO']) });
      if (path.endsWith('/catalog/categories')) return route.fulfill({ json: envelope([]) });
      if (path.endsWith('/health')) return route.fulfill({ json: envelope({ status: 'UP' }) });
      return route.fulfill({ status: 404, json: {} });
    });

    await page.goto('/catalog/ZERO');
    await expect(page.locator('sc-product-option-selector')).toHaveCount(0);
    await expect(page.locator('select[name="variant"]')).toHaveCount(0);
    await expect(page.getByText('SKU ZERO')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    let axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

    await page.goto('/catalog/ONE-M');
    await expect(page.getByLabel('Tamaño')).toHaveValue('m');
    await expect(page.locator('sc-product-option-selector select')).toHaveCount(1);
    await expect(page.getByText('SKU ONE-M')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);

    await page.goto('/catalog/TWO-M-DARK');
    await expect(page.getByLabel('Tamaño')).toHaveValue('m');
    await expect(page.getByRole('radio', { name: /Oscuro/ })).toBeChecked();
    await expect(page.getByText('SKU TWO-M-DARK')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter(item => item.impact === 'serious' || item.impact === 'critical')).toEqual([]);
  });
}
