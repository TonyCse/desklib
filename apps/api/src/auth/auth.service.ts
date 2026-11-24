import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../common/decorators/auth.decorators.js';

const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect';

/** Version publique d'un utilisateur : jamais de passwordHash dans les réponses. */
export interface PublicUser extends AuthUser {
  teamName: string | null;
  teamColor: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        teamId: true,
        passwordHash: true,
      },
    });

    // Même message et même temps de réponse que l'email soit connu ou non (argon2 est exécuté
    // dans les deux cas) : on évite de révéler quels comptes existent.
    const hash =
      user?.passwordHash ?? (await argon2.hash('invalid-placeholder'));
    const valid = await argon2.verify(hash, password).catch(() => false);
    if (!user || !valid) throw new UnauthorizedException(INVALID_CREDENTIALS);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      teamId: user.teamId,
    };
  }

  signSession(user: AuthUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id });
  }

  async getPublicUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        teamId: true,
        team: { select: { name: true, color: true } },
      },
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      teamId: user.teamId,
      teamName: user.team?.name ?? null,
      teamColor: user.team?.color ?? null,
    };
  }
}
