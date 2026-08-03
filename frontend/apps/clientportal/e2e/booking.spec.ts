import { test, expect, type Page } from '@playwright/test';

const password = 'TestPass123!';
let userSeq = 0;

async function register(page: Page) {
  const email = `e2e_${Date.now()}_${userSeq++}@test.local`;
  await page.goto('/login');
  await page.getByRole('button', { name: /register/i }).click();
  await page.getByPlaceholder('Name').fill('E2E Tester');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/book');
  // Wait for the post-registration API calls (chains, locations, treatments) to settle so the
  // treatment buttons are ready before we interact.
  await page.waitForLoadState('networkidle');
}

// Works against whatever the seed data calls its treatments — hardcoding names breaks if the DB
// is re-seeded with different demo data.
async function selectFirstTwoTreatments(page: Page) {
  await expect(page.getByRole('heading', { name: 'Book a treatment' })).toBeVisible();
  const treatmentButtons = page.locator('button', { hasText: /min · \$/ });
  await expect(treatmentButtons.first()).toBeVisible({ timeout: 10_000 });
  await treatmentButtons.nth(0).click();
  await treatmentButtons.nth(1).click();
  await page.getByRole('button', { name: /Continue with 2 treatment/ }).click();
}

async function pickFirstDate(page: Page) {
  const dateButton = page.locator('button', { hasText: /[A-Z][a-z]{2}, [A-Z][a-z]{2} \d/ }).first();
  await expect(dateButton).toBeVisible({ timeout: 10_000 });
  await dateButton.click();
}

async function getTreatmentHeaders(page: Page) {
  const headers = page.locator('h3', { hasText: /min/ });
  await expect(headers.first()).toBeVisible({ timeout: 10_000 });
  return headers;
}

test.describe('Booking flow', () => {
  test('register, select treatments, pick date, see per-treatment slots', async ({ page }) => {
    await register(page);
    await selectFirstTwoTreatments(page);
    await pickFirstDate(page);

    const headers = await getTreatmentHeaders(page);
    await expect(headers.nth(0)).toBeVisible();
    await expect(headers.nth(1)).toBeVisible();
  });

  test('selecting a slot creates a hold; held slot stays enabled', async ({ page }) => {
    await register(page);
    await selectFirstTwoTreatments(page);
    await pickFirstDate(page);

    const headers = await getTreatmentHeaders(page);
    const firstSection = page.locator('div').filter({ has: headers.nth(0) }).first();
    const firstSlots = firstSection.locator('button');
    await expect(firstSlots.first()).toBeVisible({ timeout: 10_000 });

    const firstSlotText = (await firstSlots.first().textContent())!.trim();
    await firstSlots.first().click();

    await expect(page.getByText(/Held/)).toBeVisible({ timeout: 15_000 });

    const heldButton = firstSection.locator('button', { hasText: firstSlotText }).first();
    await expect(heldButton).not.toBeDisabled();

    const secondSection = page.locator('div').filter({ has: headers.nth(1) }).first();
    await expect(secondSection.locator('button').first()).toBeVisible();
  });

  test('after holding all treatments, summary appears and booking confirms', async ({ page }) => {
    await register(page);
    await selectFirstTwoTreatments(page);
    await pickFirstDate(page);

    const headers = await getTreatmentHeaders(page);
    const firstSection = page.locator('div').filter({ has: headers.nth(0) }).first();
    const secondSection = page.locator('div').filter({ has: headers.nth(1) }).first();

    await firstSection.locator('button').first().click();
    await expect(page.getByText(/Held/)).toBeVisible({ timeout: 15_000 });

    const secondSlots = secondSection.locator('button');
    const count = await secondSlots.count();
    let picked = false;
    for (let i = 0; i < count; i++) {
      const btn = secondSlots.nth(i);
      if (await btn.isEnabled()) {
        await btn.click();
        picked = true;
        break;
      }
    }
    expect(picked).toBeTruthy();

    await expect(page.getByText(/Held for/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Confirm bookings' })).toBeVisible();

    await page.getByRole('button', { name: 'Confirm bookings' }).click();
    await expect(page.getByRole('heading', { name: 'Booked!' })).toBeVisible({ timeout: 15_000 });
  });

  test('holds persist across page refresh', async ({ page }) => {
    await register(page);
    await selectFirstTwoTreatments(page);
    await pickFirstDate(page);

    const headers = await getTreatmentHeaders(page);
    const firstSection = page.locator('div').filter({ has: headers.nth(0) }).first();
    await firstSection.locator('button').first().click();
    await expect(page.getByText(/Held/)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText(/Held/)).toBeVisible({ timeout: 20_000 });
  });
});