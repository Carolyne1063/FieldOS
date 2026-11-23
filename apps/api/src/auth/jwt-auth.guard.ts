import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from './auth.types.js';
import { IS_PUBLIC_KEY } from './decorators.js';

interface AccessPayload {
  sub: string;
  org: string | null;
  role: AuthUser['role'];
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const cookies = request.cookies as Record<string, string | undefined>;
    const token = cookies['fieldos_access'];
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token);
      request.user = {
        id: payload.sub,
        organizationId: payload.org,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}