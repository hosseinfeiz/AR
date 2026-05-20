// F6: second Playwright E2E — mirrors submit-maintenance.spec.ts for the
// showing-request flow.
//
// Per F6, navigate to /schedule?building=<grass-lake-manor-id>, fill the
// form, submit, and assert the success state ("Showing request received"
// per ShowingForm.tsx).
//
// Form submission only fires when E2E_SUBMIT=true is set (mirrors the
// maintenance spec). Otherwise we just verify the form renders and accepts
// input — sufficient to catch regressions in the page wiring without
// requiring a live Supabase or Turnstile.
import { test, expect } from '@playwright/test'

const GRASS_LAKE_MANOR_ID = '11111111-1111-1111-1111-111111111111'

test('showing form renders and accepts a preferred date', async ({ page }) => {
  // F6 spec navigates with ?building=<id>; the current schedule.astro
  // doesn't yet read that param (it reads ?unit=), so we navigate plain
  // and click the building button — same end state, smaller regression
  // surface.
  await page.goto(`/schedule?building=${GRASS_LAKE_MANOR_ID}`)
  await expect(page.getByRole('heading', { name: /Schedule a showing/i })).toBeVisible()

  // Pick the Grass Lake Manor building.
  await page.getByText(/Grass Lake Manor/i).first().click()

  // Propose a date ~14 days out.
  const future = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  await page.locator('input[type="date"]').first().fill(future)

  // Prospect details.
  await page.getByLabel(/Your name/i).fill('Prospect Tester')
  await page.getByLabel(/Email/i).fill('prospect@example.com')
  await page.getByLabel(/Phone/i).fill('555-1234')
  await page.getByLabel(/Message/i).fill('Interested in the 2BR — flexible on day.')

  // Skip captcha + actual submit unless E2E_SUBMIT is explicitly set.
  // The form is wired to Supabase directly (not an API route), so a real
  // submit requires PUBLIC_SUPABASE_URL/anon key to be set OR mockMode=true
  // (which is auto-activated when those vars are missing or placeholders).
  if (process.env.E2E_SUBMIT === 'true') {
    await page.getByRole('button', { name: /Request showing/i }).click()
    await expect(page.getByText(/Showing request received/i)).toBeVisible({ timeout: 15_000 })
    // Reference id should be visible in the success state.
    await expect(page.getByText(/Reference:/i)).toBeVisible()
  }
})

test('showing form surfaces validation errors when submitted empty', async ({ page }) => {
  await page.goto('/schedule')
  await expect(page.getByRole('heading', { name: /Schedule a showing/i })).toBeVisible()
  // Clicking submit without selecting a building should not throw and
  // should not navigate away.
  await page.getByRole('button', { name: /Request showing/i }).click()
  // We expect at least one of the validation hint strings to be visible.
  // (Building required OR preferred-date required.)
  const buildingErr = page.getByText(/Pick a building/i)
  const dateErr = page.getByText(/at least one preferred date/i)
  await expect(buildingErr.or(dateErr)).toBeVisible()
})
