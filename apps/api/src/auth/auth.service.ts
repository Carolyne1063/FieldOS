import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DRIZZLE, type Database } from '../db/db.module.js';
import { refreshTokens, users } from '../db/schema.js';

type User = typeof users.$inferSelect;

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Used so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordOk || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user);
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new UnauthorizedException();

    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, hashToken(rawToken)),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!row) throw new UnauthorizedException();

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    if (!user || !user.isActive) throw new UnauthorizedException();

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));

    return this.issueTokens(user);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, hashToken(rawToken)));
  }

  private async issueTokens(user: User) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      org: user.organizationId,
      role: user.role,
    });

    const refreshToken = randomBytes(48).toString('base64url');
    await this.db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }
}