import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Charge le .env racine s'il existe (absent en CI, où les variables sont fournies par l'environnement). */
export function loadRootEnv(
  relative = '../../../.env',
  base = import.meta.url,
): void {
  const path = fileURLToPath(new URL(relative, base));
  if (existsSync(path)) process.loadEnvFile(path);
}
