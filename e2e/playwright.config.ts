import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout. Le serveur de dev (front + API) est lancé automatiquement,
 * sauf si une instance tourne déjà en local.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4200',
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    // Vérifie le front ET l'API : sinon un serveur à moitié démarré ferait échouer les tests.
    url: ['http://localhost:4200/connexion', 'http://localhost:3000/api/health'],
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
