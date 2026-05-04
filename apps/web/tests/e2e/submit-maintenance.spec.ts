import { test, expect } from '@playwright/test'

test('maintenance form renders and validates', async ({ page }) => {
  await page.goto('/maintenance')
  await expect(page.getByRole('heading', { name: /Maintenance request/i })).toBeVisible()
  await page.getByText(/Grass Lake Manor/i).first().click()
  await page.getByLabel(/Unit number/i).fill('3B')
  await page.getByLabel(/Your name/i).fill('E2E Tester')
  await page.getByLabel(/Email/i).fill('e2e@example.com')
  await page.getByLabel(/Issue type/i).selectOption('plumbing')
  await page.getByText(/^normal$/i).click()
  await page.getByLabel(/Description/i).fill('Sink leaking under cabinet — end-to-end test.')
  // Skip captcha + actual submit unless TURNSTILE_BYPASS env is set
  if (process.env.E2E_SUBMIT === 'true') {
    await page.getByRole('button', { name: /Submit request/i }).click()
    await expect(page.getByText(/Request received/i)).toBeVisible({ timeout: 15_000 })
  }
})
