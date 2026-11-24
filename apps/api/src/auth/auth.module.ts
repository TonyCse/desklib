import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SESSION_MAX_AGE_MS } from './session.js';

@Module({
  imports: [
    // registerAsync : process.env n'est lu qu'au démarrage, après le chargement du .env.
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env['JWT_SECRET'];
        if (!secret || secret.length < 32) {
          throw new Error(
            'JWT_SECRET absent ou trop court (32 caractères minimum)',
          );
        }
        return {
          secret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: Math.floor(SESSION_MAX_AGE_MS / 1000),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule],
})
export class AuthModule {}
