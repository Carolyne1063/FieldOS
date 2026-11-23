import type { UserRole } from '@fieldos/shared';

export interface AuthUser {
  id: string;
  organizationId: string | null;
  role: UserRole;
}