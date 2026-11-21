export const USER_ROLES = [
  'super_admin',
  'owner',
  'dispatcher',
  'supervisor',
  'technician',
  'customer',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const JOB_STATUSES = [
  'requested',
  'scheduled',
  'assigned',
  'en_route',
  'in_progress',
  'pending_review',
  'approved',
  'rejected',
  'cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];