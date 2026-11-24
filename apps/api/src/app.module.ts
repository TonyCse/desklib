import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { OriginCheckMiddleware } from './common/middleware/origin-check.middleware.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { FloorsModule } from './floors/floors.module.js';
import { SettingsController } from './settings/settings.controller.js';
import { AdminModule } from './admin/admin.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    // Limite globale généreuse ; le login a sa propre limite stricte (@Throttle sur la route).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    FloorsModule,
    BookingsModule,
    TeamsModule,
    AdminModule,
  ],
  controllers: [SettingsController, HealthController],
  providers: [
    // L'ordre compte : limitation de débit, puis authentification, puis rôles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginCheckMiddleware).forRoutes('*');
  }
}
