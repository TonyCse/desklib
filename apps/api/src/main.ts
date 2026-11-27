import { createApp } from './create-app.js';

// Serveur local (npm run dev) : la même application que la fonction Vercel, avec une écoute.
const app = await createApp();
await app.listen(Number(process.env['PORT'] ?? 3000));
