// ============================================================
// RBAC - Role Based Access Control helpers
// ============================================================
import { UserRole, ROLE_LEVELS, MANAGER_ROLES } from '../types';

/** Returns true if roleA is strictly above roleB in hierarchy */
export function isAbove(roleA: UserRole, roleB: UserRole): boolean {
  return ROLE_LEVELS[roleA] < ROLE_LEVELS[roleB];
}

/** Returns true if user can manage (create/edit/delete) target role */
export function canManageRole(myRole: UserRole, targetRole: UserRole): boolean {
  if (myRole === 'super_admin') return true;
  if (myRole === 'dev_manager') return ROLE_LEVELS[targetRole] >= 2; // gs and below
  return isAbove(myRole, targetRole);
}

/** Returns true if user has management permissions */
export function isManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

/** Returns true if user can access admin reports */
export function canViewAdminReports(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'].includes(role);
}

/** Returns true if user can manage targets for others */
export function canManageTargets(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'].includes(role);
}

/** Returns true if user can perform org-chart moves */
export function canRearrangeOrg(role: UserRole): boolean {
  return ['super_admin', 'dev_manager'].includes(role);
}

/** Returns true if user can close months */
export function canCloseMonth(role: UserRole): boolean {
  return ['super_admin', 'dev_manager'].includes(role);
}

/** Returns true if user can view audit logs */
export function canViewAudit(role: UserRole): boolean {
  return ['super_admin', 'dev_manager'].includes(role);
}

/** Returns true if user can manage system settings */
export function canManageSettings(role: UserRole): boolean {
  return role === 'super_admin';
}

/** Roles the current user is allowed to assign when creating/editing users */
export function assignableRoles(myRole: UserRole): UserRole[] {
  const all: UserRole[] = ['super_admin','dev_manager','general_supervisor','supervisor','team_leader','agent'];
  if (myRole === 'super_admin') return all;
  return all.filter(r => ROLE_LEVELS[r] > ROLE_LEVELS[myRole]);
}
