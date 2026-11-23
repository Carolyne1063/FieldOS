import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, gt, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { DRIZZLE, type Database } from '../db/db.module.js';
import { organizations, refreshTokens, users } from '../db/schema.js';

type User = typeof users.$inferSelect;

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Used so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'company';
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async signupOrganization(input: {
    organizationName: string;
    name: string;
    email: string;
    password: string;
  }) {
    const email = input.email.toLowerCase();

    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const slug = await this.uniqueSlug(input.organizationName);

    const user = await this.db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.organizationName, slug })
        .returning();
      if (!org) throw new Error('Could not create organization');

      const [created] = await tx
        .insert(users)
        .values({
          organizationId: org.id,
          name: input.name,
          email,
          passwordHash,
          role: 'org_admin',
        })
        .returning();
      if (!created) throw new Error('Could not create user');

      return created;
    });

    return this.issueTokens(user);
  }

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

    async getProfile(userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || !user.isActive) throw new UnauthorizedException();

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };
  }
  
  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;

    for (let attempt = 0; attempt < 5; attempt++) {
      const [taken] = await this.db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (!taken) return slug;
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }
    throw new ConflictException(
      'Could not generate a unique company address, try a different name',
    );
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