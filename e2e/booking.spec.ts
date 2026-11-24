import { expect, test } from '@playwright/test';

/**
 * Parcours principal : je me connecte, je réserve un poste, je le retrouve dans
 * « Mes réservations », puis je l'annule. Les données viennent du seed Meridia.
 *
 * On réserve à partir de demain : aujourd'hui, le créneau du matin est déjà commencé
 * et l'annulation n'est pas proposée (comportement voulu).
 */
test('je me connecte, je réserve un poste, je le retrouve et je l’annule', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('button', { name: /se connecter en tant que salarié/i }).click();
  await expect(page).toHaveURL(/\/plan$/);

  // Vue liste : accessible et stable quelle que soit la taille d'écran.
  await page.getByRole('button', { name: 'Liste', exact: true }).click();

  // Les dates sont proposées en boutons ; on parcourt celles à venir jusqu'à une réservation réussie.
  const dateSelect = page.getByLabel('Date', { exact: true });
  await expect(dateSelect).toBeVisible();
  // Le sélecteur ne contient qu'une option vide tant que la page n'a pas chargé : on attend les vraies dates.
  await expect.poll(() => dateSelect.locator('option').count()).toBeGreaterThan(1);
  const optionCount = await dateSelect.locator('option').count();
  let bookedLabel: string | null = null;

  for (let i = 1; i < Math.min(optionCount, 9) && bookedLabel === null; i++) {
    // Attend le rechargement des disponibilités avant de cliquer (évite un état périmé).
    await Promise.all([
      // Disponibilité de l'étage (et non celle des véhicules ou des salles, qui ont aussi « availability »).
      page.waitForResponse((r) => /\/api\/floors\/[^/]+\/availability/.test(r.url()) && r.ok()),
      dateSelect.selectOption({ index: i }),
    ]);

    // Attend que la liste des postes soit affichée (les données arrivent avec les véhicules et les salles).
    await page
      .getByRole('button', { name: /^Poste / })
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => undefined);
    const freeDesk = page
      .getByRole('button', { name: /^Poste .+, libre toute la journée$/ })
      .first();
    if (!(await freeDesk.isVisible({ timeout: 1000 }).catch(() => false))) continue;

    await freeDesk.click();
    // Le détail du poste s'affiche dans un panneau (région nommée d'après le poste).
    const panel = page.getByRole('region', { name: /Poste/ });
    await expect(panel).toBeVisible();

    const fullDay = panel.getByRole('button', { name: 'Réserver la journée' });
    if (!(await fullDay.isEnabled())) {
      await page.keyboard.press('Escape');
      continue;
    }

    const bookingResponse = page.waitForResponse(
      (r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST',
    );
    await fullDay.click();
    const response = await bookingResponse;

    if (response.ok()) {
      const toast = page.getByText(/réservé la journée/);
      await expect(toast).toBeVisible();
      bookedLabel = /Poste (\S+) réservé/.exec((await toast.textContent()) ?? '')?.[1] ?? null;
    } else {
      // Quota, double réservation… : on tente la date suivante.
      await page.keyboard.press('Escape');
    }
  }

  expect(bookedLabel, 'un poste libre a pu être réservé').not.toBeNull();
  const label = bookedLabel as string;

  // Retrouvé dans « Mes réservations ».
  await page.getByRole('link', { name: 'Mes réservations' }).first().click();
  await expect(page).toHaveURL(/\/mes-reservations$/);
  await expect(page.getByText(`Poste ${label} ·`).first()).toBeVisible();

  // Annulation avec confirmation.
  await page
    .getByRole('button', { name: `Annuler la réservation : Poste ${label} du` })
    .first()
    .click();
  await page.getByRole('button', { name: 'Oui, annuler' }).click();
  await expect(page.getByText(/Réservation annulée : Poste/)).toBeVisible();
});
