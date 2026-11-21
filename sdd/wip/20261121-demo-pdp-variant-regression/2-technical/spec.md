# Technical correction

Preserve `EnrichCatalogDemoSeedStep` and `VariantSaleState.Disabled` rules. No runtime behavior or stock policy changes are justified: Playwright's trace shows the first Case selection succeeds on DEMO-001, and only the second selection on DEMO-002 is blocked. SC17B already verifies this deliberate disabled state.

Update only the incompatible regression journey. Use the existing closed `DemoProductVariant` instances for presentation wire values in the touched assertions. Prove disabled Case through the option's DOM disabled property, not by forcing interaction. Navigate to DEMO-004 for a genuinely active Case before testing transition to the Standard-only item.

Gates: run the quantity/navigation case three times; run the complete review-regressions file and SC17B file together; build demo; diff whitespace check. Independent reviews and combined branch gates belong to parent close-out and remain pending here.
