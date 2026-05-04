import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const routes = ['/', '/listings', '/buildings/grass-lake-manor', '/about', '/contact']
for (const r of routes) {
  test(`a11y: ${r}`, async ({ page }) => {
    await page.goto(r)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
}
