import { fileURLToPath } from 'node:url';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  // Le .env est unique, à la racine du monorepo. Chargé avant toute instanciation des services.
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));

  const app = await NestFactory.create(AppModule);

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

  await app.listen(Number(process.env['PORT'] ?? 3000));
}

await bootstrap();
