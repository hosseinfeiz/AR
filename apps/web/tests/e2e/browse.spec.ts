import { test, expect } from '@playwright/test'

test('home shows both buildings', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Grass Lake Manor/i)).toBeVisible()
  await expect(page.getByText(/Winnetka Manor/i)).toBeVisible()
})

test('listings page loads without error', async ({ page }) => {
  await page.goto('/listings')
  await expect(page.getByRole('heading', { name: /Available apartments/i })).toBeVisible()
})

test('building detail loads', async ({ page }) => {
  await page.goto('/buildings/grass-lake-manor')
  await expect(page.getByRole('heading', { name: /Grass Lake Manor/i })).toBeVisible()
})
