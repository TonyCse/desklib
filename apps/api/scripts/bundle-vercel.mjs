// Regroupe l'API compilée (dist) et ses dépendances en un seul fichier ESM pour la fonction Vercel.
// Pourquoi : certains paquets NestJS sont en CommonJS et chargent des modules ES par require(),
// ce que le runtime Vercel refuse. Le bundle n'a plus aucun require() vers un module ES.
// Le fichier produit (dist/vercel-bundle.mjs) est importé par api/[...all].mjs, qui est versionné.
import { build } from 'esbuild';

await build({
  entryPoints: ['dist/vercel-handler.js'],
  outfile: 'dist/vercel-bundle.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Module natif, et paquets optionnels de Nest non installés (jamais chargés par cette API).
  external: ['argon2', '@nestjs/microservices*', '@nestjs/websockets*'],
  // Les dépendances CommonJS encore présentes dans le bundle peuvent appeler require().
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
