import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Captures d'écran pour le README. Désactivé par défaut : `npm run screenshots`.
 * Les images sont écrites dans docs/screenshots/.
 */
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots');

test.skip(!process.env['SCREENSHOTS'], 'Captures uniquement sur demande (npm run screenshots).');

test.use({ viewport: { width: 1280, height: 800 } });

test('captures des écrans principaux', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  await page.goto('/connexion');
  await expect(page.getByRole('heading', { name: 'Connexion à Îlot' })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'connexion.png') });

  // Salarié : plan d'étage, vue plan, puis popover ouverte sur un poste libre.
  await page.getByRole('button', { name: /se connecter en tant que salarié/i }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.locator('svg[role="group"]')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'plan-etage.png') });

  await page.getByRole('button', { name: 'Liste', exact: true }).click();
  await page
    .getByRole('button', { name: /^Poste .+, libre toute la journée$/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'popover-reservation.png') });
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Mes réservations' }).first().click();
  await expect(page.getByRole('tab', { name: 'À venir' })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'mes-reservations.png') });

  await page.getByRole('link', { name: 'Planning d’équipe' }).first().click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'planning-equipe.png') });

  // Admin : statistiques.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.waitForURL(/\/connexion$/);
  await page.getByRole('button', { name: /se connecter en tant qu’admin/i }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await page.getByRole('link', { name: 'Administration' }).first().click();
  await page.getByRole('tab', { name: 'Statistiques' }).click();
  await expect(page.getByRole('img', { name: /Taux d’occupation/ })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, 'admin-statistiques.png'), fullPage: true });
});
