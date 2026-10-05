import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Screen } from './route-manifest';

/** Values and published content must come from loaded data, not just an attached form. */
export async function assertLoadedContent(page: Page, screen: Screen, timeout?: number): Promise<void> {
  for (const field of screen.loadedValues) await expect(page.locator(field.selector)).toHaveValue(field.value, { timeout });
  for (const content of screen.loadedTexts) await expect(page.locator(content.selector)).toContainText(content.text, { timeout });
}
