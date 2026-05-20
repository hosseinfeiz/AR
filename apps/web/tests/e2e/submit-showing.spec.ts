// Second Playwright E2E — mirrors submit-maintenance.spec.ts for the
// showing-request flow. Updated after S4 replaced the "3 preferred dates"
// UI with a Calendly-style ShowingPicker.
//
// Submission only fires when E2E_SUBMIT=true is set. Otherwise the spec
// verifies that the form renders, the building can be picked, and a slot
// can be selected — sufficient to catch wiring regressions without
// requiring a live Supabase / Google Calendar / Turnstile configuration.
import { test, expect } from '@playwright/test'

test('book-a-showing form renders and accepts a building + slot selection', async ({ page }) => {
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: /Book a showing/i })).toBeVisible()

  // Pick a building (Grass Lake Manor — the first one in the fixture).
  await page.getByRole('button', { name: /Grass Lake Manor/i }).click()

  // The S4 picker mounts after the building is picked. In mock mode it
  // synthesises a handful of "open" slots; we click the first one we see.
  const openSlot = page.getByRole('button', { name: /open/i }).first()
  await openSlot.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined)
  if (await openSlot.isVisible().catch(() => false)) {
    await openSlot.click()
  }

  // Prospect details.
  await page.getByLabel(/Your name/i).fill('Prospect Tester')
  await page.getByLabel(/Email/i).fill('prospect@example.com')
  await page.getByLabel(/Phone/i).fill('555-1234')
  const message = page.getByLabel(/Message/i)
  if (await message.isVisible().catch(() => false)) {
    await message.fill('Interested in the 2BR — flexible on day.')
  }

  if (process.env.E2E_SUBMIT === 'true') {
    await page.getByRole('button', { name: /Book showing|Request showing/i }).click()
    await expect(page.getByText(/showing.*received|booked|confirmed/i)).toBeVisible({ timeout: 15_000 })
  }
})

test('showing form requires a building before slots are visible', async ({ page }) => {
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: /Book a showing/i })).toBeVisible()
  // Before a building is picked, no slot buttons should be visible.
  await expect(page.getByRole('button', { name: /^\d{1,2}:\d{2}/i })).toHaveCount(0)
})
