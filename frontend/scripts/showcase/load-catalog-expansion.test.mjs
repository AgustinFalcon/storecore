import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CatalogExpansionDecision, buildCatalogExpansionFixtures } from './load-catalog-expansion.mjs';

const imagePool = Array.from(
  { length: 24 },
  (_, index) => `https://images.example.invalid/ferreteria-${String(index + 1).padStart(2, '0')}.jpg`,
);

test('builds 72 diverse hardware products with four distinct images each', () => {
  const rows = buildCatalogExpansionFixtures([{ images: imagePool }]);

  assert.equal(rows.length, 72);
  assert.equal(new Set(rows.map((row) => row.sku)).size, 72);
  assert.equal(new Set(rows.map((row) => row.name)).size, 72);
  assert.equal(new Set(rows.map((row) => row.category)).size, 12);
  for (const row of rows) {
    assert.match(row.sku, /^SHOW-PLUS-\d{3}$/);
    assert.equal(row.images.length, 4);
    assert.equal(new Set(row.images).size, 4);
    assert.ok(row.images.every((image) => image.startsWith('https://')));
    assert.ok(row.price > 0);
    assert.ok(row.stock > 0);
  }
});

test('catalog expansion decision is a closed wire type with an Unknown fallback', () => {
  assert.equal(CatalogExpansionDecision.fromWire('CREATE'), CatalogExpansionDecision.Create);
  assert.equal(CatalogExpansionDecision.fromWire('RECONCILE'), CatalogExpansionDecision.Reconcile);
  assert.equal(CatalogExpansionDecision.fromWire('PRESERVE'), CatalogExpansionDecision.Preserve);
  assert.equal(CatalogExpansionDecision.fromWire('future-state'), CatalogExpansionDecision.Unknown);
});
