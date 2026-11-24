import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Défense en profondeur contre le CSRF. SameSite=Strict bloque déjà l'envoi du cookie
 * depuis un autre site ; on refuse en plus les requêtes qui modifient des données
 * si l'en-tête Origin est présent et ne correspond pas au front autorisé.
 */
@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const allowed = process.env['WEB_ORIGIN'];
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin && origin !== allowed) {
      throw new ForbiddenException('Origine de requête non autorisée');
    }
    next();
  }
}
