import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SESSION_COOKIE } from '../../auth/session.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthUser, IS_PUBLIC_KEY } from '../decorators/auth.decorators.js';

/**
 * Garde globale : exige une session valide (cookie httpOnly contenant un JWT),
 * sauf sur les routes marquées @Public(). L'utilisateur est rechargé depuis la base
 * à chaque requête pour que les changements de rôle ou d'équipe prennent effet tout de suite.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const token: unknown = request.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Session requise');
    }

    let subject: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      subject = payload.sub;
    } catch {
      throw new UnauthorizedException(
        'Session expirée, veuillez vous reconnecter',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: subject },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        teamId: true,
      },
    });
    if (!user) throw new UnauthorizedException('Session invalide');

    request.user = user;
    return true;
  }
}
