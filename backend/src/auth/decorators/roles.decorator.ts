import { SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Usage: `@Roles('ADMIN', 'SUPPORT')` on a controller or handler, always
 * combined with `RolesGuard` (which reads this metadata) and
 * `JwtAuthGuard` (which must run first — RolesGuard trusts
 * `request.userId`, it doesn't authenticate on its own).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
