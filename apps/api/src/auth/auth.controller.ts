import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
  Public,
} from '../common/decorators/auth.decorators.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from './session.js';
import { LoginDto } from './dto/login.dto.js';

const isProduction = (): boolean => process.env['NODE_ENV'] === 'production';

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    // Front et API sur le même site (proxy en dev, rewrite en prod) : Strict est possible.
    sameSite: 'strict' as const,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /** 10 tentatives par minute et par IP : limite le brute force sur le mot de passe. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    const token = await this.auth.signSession(user);
    res.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_MAX_AGE_MS,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'AUTH_LOGIN',
      entityType: 'User',
      entityId: user.id,
    });
    return this.auth.getPublicUser(user.id);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getPublicUser(user.id);
  }
}
