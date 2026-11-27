import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadRootEnv } from './env.js';

/**
 * Crée l'application NestJS sans démarrer d'écoute. Utilisée par le serveur local (main.ts)
 * et par la fonction serverless Vercel (api/[...all].mjs).
 */
export async function createApp(): Promise<INestApplication> {
  // Le .env est unique, à la racine du monorepo. Chargé avant toute instanciation des services.
  loadRootEnv();

  const app = await NestFactory.create(AppModule);

  // Derrière le proxy de Vercel, l'IP réelle arrive dans X-Forwarded-For : la limitation de débit doit la voir.
  const server = app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void };
  server.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env['WEB_ORIGIN'],
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return app;
}
