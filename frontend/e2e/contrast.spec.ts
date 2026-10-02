import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { compile } from 'sass';

test('production secondary text meets contrast on canvas and informational callouts', async ({ page }) => {
  const css = compile(resolve(__dirname, '../src/styles.scss')).css;
  await page.setContent(`<html lang="es"><head><title>Contraste</title><style>${css}</style></head><body>
    <main><h1>Contraste de texto secundario</h1>
      <p class="sc-pdp__crumb"><a href="/catalog">Catálogo</a> / Producto</p>
      <p class="sc-price__meta">Precio de lista</p>
      <p class="sc-callout sc-callout--info">Pago de prueba <span class="sc-mono">test-order</span></p>
    </main></body></html>`);
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
});
