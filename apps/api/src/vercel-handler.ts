import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './create-app.js';

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

// Fonction serverless Vercel : toute requête /api/* est traitée par l'application NestJS.
// L'application est créée une fois par instance, puis réutilisée entre les requêtes.
let handler: RequestHandler | null = null;

export default async function api(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  if (!handler) {
    const app = await createApp();
    await app.init();
    handler = app.getHttpAdapter().getInstance() as RequestHandler;
  }
  return handler(req, res);
}
