import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { organizations, users } from './schema.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const [existing] = await db
  .select()
  .from(organizations)
  .where(eq(organizations.slug, 'secureview'))
  .limit(1);

const [created] = existing
  ? []
  : await db
      .insert(organizations)
      .values({ name: 'SecureView Systems', slug: 'secureview' })
      .returning();

const org = existing ?? created;
if (!org) throw new Error('Could not create the demo organization');

const passwordHash = await bcrypt.hash('ChangeMe123!', 10);

await db
  .insert(users)
  .values([
        {
      organizationId: org.id,
      name: 'Demo Admin',
      email: 'admin@secureview.test',
      passwordHash,
      role: 'org_admin',
    },
    {
      organizationId: null,
      name: 'Platform Admin',
      email: 'admin@fieldos.test',
      passwordHash,
      role: 'super_admin',
    },
  ])
  .onConflictDoNothing();

console.log('Seeded: admin@secureview.test and admin@fieldos.test (password: ChangeMe123!)');