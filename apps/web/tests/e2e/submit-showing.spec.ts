import { test, expect } from '@playwright/test'

test('showing form renders and accepts a preferred date', async ({ page }) => {
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: /Schedule a showing/i })).toBeVisible()
  await page.getByText(/Grass Lake Manor/i).first().click()
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  await page.locator('input[type="date"]').first().fill(future)
  await page.getByLabel(/Your name/i).fill('Prospect Tester')
  await page.getByLabel(/Email/i).fill('prospect@example.com')
  if (process.env.E2E_SUBMIT === 'true') {
    await page.getByRole('button', { name: /Request showing/i }).click()
    await expect(page.getByText(/Showing request received/i)).toBeVisible({ timeout: 15_000 })
  }
})
