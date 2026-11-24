import { expect, test } from '@playwright/test';

/**
 * En vue 3D, un clic sur un véhicule ouvre son panneau de réservation (comme un poste).
 * La position du véhicule dans la scène est fixe pour la vue par défaut (1280 × 800).
 */
test('un clic sur un véhicule en 3D ouvre sa réservation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/connexion');
  await page.getByRole('button', { name: /se connecter en tant que salarié/i }).click();
  await expect(page).toHaveURL(/\/plan$/);

  await expect(page.locator('[data-status="ready"]')).toBeVisible({ timeout: 90_000 });
  // Sur la vue 3D par défaut, la première voiture se trouve près de (210, 378).
  await page.mouse.move(210, 378);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByRole('region', { name: /Peugeot 3008|Renault Kangoo/ })).toBeVisible({
    timeout: 10_000,
  });
});

test('un clic sur une salle de réunion en 3D ouvre sa réservation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/connexion');
  await page.getByRole('button', { name: /se connecter en tant que salarié/i }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('[data-status="ready"]')).toBeVisible({ timeout: 90_000 });

  // Première salle de réunion (zone de droite, en bas de la scène par défaut).
  await page.mouse.move(850, 455);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByRole('region', { name: /Salle (Lumière|Horizon)/ })).toBeVisible({
    timeout: 10_000,
  });
});
