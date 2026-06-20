// ============================================================
// RBAC - Role Based Access Control helpers
// Updated to support User + Branch + Role model
// ============================================================
import { UserRole, ROLE_LEVELS, MANAGER_ROLES } from '../types';
import { UserBranchAccess } from '../types';

/** Returns true if roleA is strictly above roleB in hierarchy */
export function isAbove(roleA: UserRole, roleB: UserRole): boolean {
  return ROLE_LEVELS[roleA] < ROLE_LEVELS[roleB];
}

/** Returns true if user can manage (create/edit/delete) target role within the same branch */
export function canManageRole(myRole: UserRole, targetRole: UserRole): boolean {
  return isAbove(myRole, targetRole);
}

/** Returns true if user has management permissions */
export function isManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

/** Returns true if user can view admin reports */
export function canViewAdminReports(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader'].includes(role);
}

/** Returns true if user can manage targets for others */
export function canManageTargets(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader'].includes(role);
}

/** Returns true if user can perform org-chart moves */
export function canRearrangeOrg(role: UserRole): boolean {
  return ['super_admin', 'dev_manager'].includes(role);
}

/** Returns true if user can close months */
export function canCloseMonth(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor'].includes(role);
}

/** Returns true if user can view audit logs */
export function canViewAudit(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor'].includes(role);
}

/** Returns true if user can manage system settings */
export function canManageSettings(role: UserRole): boolean {
  return role === 'super_admin';
}

/** Roles the current user is allowed to assign when creating/editing users */
export function assignableRoles(myRole: UserRole): UserRole[] {
  const all: UserRole[] = ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'];
  if (myRole === 'super_admin') return all;
  return all.filter(r => ROLE_LEVELS[r] > ROLE_LEVELS[myRole]);
}

// ============================================================
// Navigation Permissions - Role-Based Navigation
// ============================================================

/** Returns true if user can access a specific page */
export function canAccessPage(role: UserRole | null, pagePath: string): boolean {
  if (!role) return false;

  // ✅ Super Admin و Dev Manager لديهم وصول كامل لجميع الصفحات
  if (role === 'super_admin' || role === 'dev_manager') {
    return true;
  }

  const pagePermissions: Record<string, UserRole[]> = {
    '/': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'],
    '/users': ['super_admin', 'dev_manager', 'general_supervisor'],
    '/branches': ['super_admin', 'dev_manager'],
    '/branch-access': ['super_admin', 'dev_manager'],
    '/org': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader'],
    '/clients': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'],
    '/policies': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'],
    '/collections': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'],
    '/targets': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader'],
    '/tasks': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'],
    '/notifications': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'],
    '/closing': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor'],
    '/reports': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader'],
    '/audit': ['super_admin', 'dev_manager', 'general_supervisor'],
    '/settings': ['super_admin', 'dev_manager'],
  };

  const allowedRoles = pagePermissions[pagePath];
  return allowedRoles ? allowedRoles.includes(role) : false;
}

// ============================================================
// Branch-Specific Permissions
// ============================================================

/** Returns true if user has permission to perform an action in a specific branch */
export function canPerformActionInBranch(
  userRole: UserRole,
  _action: string,
  targetRole?: UserRole
): boolean {
  // Super admin can do anything
  if (userRole === 'super_admin') return true;

  // Dev manager can do anything except manage super_admin
  if (userRole === 'dev_manager') {
    return targetRole !== 'super_admin';
  }

  // General supervisor can manage lower roles
  if (userRole === 'general_supervisor') {
    return targetRole ? isAbove(userRole, targetRole) : true;
  }

  // Supervisor can manage lower roles
  if (userRole === 'supervisor') {
    return targetRole ? isAbove(userRole, targetRole) : true;
  }

  // Branch manager can manage lower roles
  if (userRole === 'branch_manager') {
    return targetRole ? isAbove(userRole, targetRole) : true;
  }

  // Team leader can manage agents
  if (userRole === 'team_leader') {
    return targetRole === 'agent';
  }

  // Agents cannot perform administrative actions
  return false;
}

/** Get the effective role of a user in a specific branch */
export function getEffectiveRole(branchAccess: UserBranchAccess | null): UserRole | null {
  if (!branchAccess || !branchAccess.is_active) return null;
  
  // Check if the access has expired
  if (branchAccess.expires_at && new Date(branchAccess.expires_at) < new Date()) {
    return null;
  }

  return branchAccess.role as UserRole;
}

/** Check if a user can supervise another user in a specific branch */
export function canSuperviseInBranch(
  supervisorRole: UserRole,
  subordinateRole: UserRole
): boolean {
  return isAbove(supervisorRole, subordinateRole);
}

/** Get list of roles that a user can assign in their branch */
export function assignableRolesInBranch(myRole: UserRole): UserRole[] {
  const all: UserRole[] = ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader', 'agent'];
  
  if (myRole === 'super_admin') return all;
  if (myRole === 'dev_manager') return all.filter(r => r !== 'super_admin');
  if (myRole === 'general_supervisor') return all.filter(r => ROLE_LEVELS[r] > ROLE_LEVELS[myRole]);
  if (myRole === 'supervisor') return all.filter(r => ROLE_LEVELS[r] > ROLE_LEVELS[myRole]);
  if (myRole === 'branch_manager') return all.filter(r => ROLE_LEVELS[r] > ROLE_LEVELS[myRole]);
  if (myRole === 'team_leader') return ['agent'];
  
  return [];
}
