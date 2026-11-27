// Fonction serverless Vercel : toute requête /api/* est traitée par l'application NestJS.
// La fonction est compilée une fois par instance, puis réutilisée entre les requêtes.
import { createApp } from '../apps/api/dist/create-app.js';

let handler = null;

export default async function api(req, res) {
  if (!handler) {
    const app = await createApp();
    await app.init();
    handler = app.getHttpAdapter().getInstance();
  }
  return handler(req, res);
}
