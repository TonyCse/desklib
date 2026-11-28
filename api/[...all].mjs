// Fonction serverless Vercel : toute requête /api/* est traitée par l'application NestJS.
// Ce fichier DOIT rester versionné : Vercel détecte les fonctions du dossier api/ dans les sources,
// avant le buildCommand. Le bundle lui-même est généré dans apps/api/dist (npm run bundle -w @desklib/api).
export { default } from '../apps/api/dist/vercel-bundle.mjs';
