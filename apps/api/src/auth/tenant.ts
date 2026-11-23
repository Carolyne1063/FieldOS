import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth.types.js';

/**
 * The company a request belongs to. Always take it from the logged-in user,
 * never from the request body or URL. A super_admin has no company, so
 * company-level actions are refused for them.
 */
export function requireOrgId(user: AuthUser): string {
  if (!user.organizationId) {
    throw new ForbiddenException('This action needs a company account');
  }
  return user.organizationId;
}