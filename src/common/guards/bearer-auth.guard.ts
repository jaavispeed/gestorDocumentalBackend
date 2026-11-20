import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Permitir preflight OPTIONS de CORS sin token
    if (request.method === 'OPTIONS') {
      return true;
    }

    const expectedToken = this.configService.get<string>('API_BEARER_TOKEN');

    // Si no hay token configurado en las variables de entorno, no se bloquea
    if (!expectedToken) {
      return true;
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader) {
      throw new UnauthorizedException('Falta la cabecera Authorization');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Formato de token inválido. Debe ser: Bearer <token>',
      );
    }

    if (token !== expectedToken) {
      throw new UnauthorizedException('Token de autorización no válido');
    }

    return true;
  }
}
