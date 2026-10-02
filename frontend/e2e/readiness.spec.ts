import { expect, test } from '@playwright/test';
import { assertLoadedContent } from './readiness';
import { screens } from './route-manifest';

test('customer orders readiness requires a loaded order link and product, not an empty list', async ({ page }) => {
  const screen = screens.find((entry) => entry.pattern === '/customer/orders')!;
  await page.setContent('<ul class="sc-order-list"></ul>');
  await expect(assertLoadedContent(page, screen, 100)).rejects.toThrow();
  await page.setContent('<ul class="sc-order-list"><li class="sc-order-card"><a href="/customer/orders/test-order">test-order</a><ul class="sc-order-card__lines"></ul></li></ul>');
  await expect(assertLoadedContent(page, screen, 100)).rejects.toThrow();
  await page.locator('.sc-order-card__lines').evaluate((list) => { list.innerHTML = '<li>Producto de prueba × 1</li>'; });
  await assertLoadedContent(page, screen);
  await expect(page.locator(screen.ready)).toBeAttached();
});

test('profile readiness rejects the attached empty default form', async ({ page }) => {
  const screen = screens.find((entry) => entry.pattern === '/customer/profile')!;
  await page.setContent('<input name="firstName"><input name="lastName"><input name="profileEmail">');
  await expect(assertLoadedContent(page, screen, 100)).rejects.toThrow();
  for (const field of screen.loadedValues) await page.locator(field.selector).fill(field.value);
  await assertLoadedContent(page, screen);
});

test('content readiness requires both loaded form values and published blocks', async ({ page }) => {
  const screen = screens.find((entry) => entry.pattern === '/user/content')!;
  await page.setContent('<input name="homeTitle"><textarea name="homeBody"></textarea>');
  await expect(assertLoadedContent(page, screen, 100)).rejects.toThrow();
  for (const field of screen.loadedValues) await page.locator(field.selector).fill(field.value);
  await expect(assertLoadedContent(page, screen, 100)).rejects.toThrow();
  await page.locator('body').evaluate((body, texts) => {
    const section = document.createElement('section');
    section.setAttribute('aria-labelledby', 'banner-blocks-title');
    const list = document.createElement('ul');
    const item = document.createElement('li');
    item.textContent = texts.join(' ');
    list.append(item); section.append(list); body.append(section);
  }, screen.loadedTexts.map((entry) => entry.text));
  await assertLoadedContent(page, screen);
});
