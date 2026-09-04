/**
 * Granular per-admin permissions (P2, docs/production-hardening-audit.md).
 * The actual logic lives in the root ../../utils/permissions.ts so it's a
 * single source of truth shared by both the client (nav filtering,
 * permissions editor) and the server — this file just re-exports it for
 * every server/ caller (server/utils/ is Nitro's own separate auto-import
 * scope, so it can't pick up the root utils/ auto-import directly).
 */
export { parsePermissions, hasAreaAccess, allowedAreas, type PermissionAction } from '../../utils/permissions'
export { ADMIN_AREAS, type AdminArea } from '../../utils/adminAreas'
