import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  organizationName: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(72),
});

const ACCESS_COOKIE = 'fieldos_access';
const REFRESH_COOKIE = 'fieldos_refresh';

function cookieOptions(maxAgeMs: number, path: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

    @Post('signup')
  @HttpCode(201)
  async signup(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid request body',
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const { accessToken, refreshToken, user } =
      await this.auth.signupOrganization(parsed.data);
    this.setCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid request body');

    const { accessToken, refreshToken, user } = await this.auth.login(
      parsed.data.email,
      parsed.data.password,
    );
    this.setCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies as Record<string, string | undefined>)[
      REFRESH_COOKIE
    ];
    const { accessToken, refreshToken, user } = await this.auth.refresh(raw);
    this.setCookies(res, accessToken, refreshToken);
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies as Record<string, string | undefined>)[
      REFRESH_COOKIE
    ];
    await this.auth.logout(raw);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return { ok: true };
  }

  private setCookies(res: Response, access: string, refresh: string) {
    res.cookie(ACCESS_COOKIE, access, cookieOptions(15 * 60 * 1000, '/'));
    res.cookie(
      REFRESH_COOKIE,
      refresh,
      cookieOptions(30 * 24 * 60 * 60 * 1000, '/auth'),
    );
  }
}