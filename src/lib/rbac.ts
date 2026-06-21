// ============================================================
// RBAC - Role Based Access Control helpers
// ============================================================
// مصدر الحقيقة الوحيد لدور المستخدم هو profiles.role (الأدوار الستة).
// جدول user_branch_access يُستخدم فقط لتحديد أي الفروع يمكن للمستخدم
// رؤية بياناتها — وليس لتحديد دوره الوظيفي. لا تتم قراءة role من
// user_branch_access في أي مكان لتحديد الصلاحيات (كان هذا مصدر تعارض
// رئيسي قبل الإصلاح: نفس المستخدم كان يظهر بدور مختلف في كل فرع).
// ============================================================
import { UserRole, ROLE_LEVELS, MANAGER_ROLES } from '../types';

/** Returns true if roleA is strictly above roleB in hierarchy */
export function isAbove(roleA: UserRole, roleB: UserRole): boolean {
  return ROLE_LEVELS[roleA] < ROLE_LEVELS[roleB];
}

/** Returns true if user can manage (create/edit/delete) target role */
export function canManageRole(myRole: UserRole, targetRole: UserRole): boolean {
  return isAbove(myRole, targetRole);
}

/** Returns true if user has management permissions */
export function isManager(role: UserRole): boolean {
  return MANAGER_ROLES.includes(role);
}

/** Returns true if user can view admin reports */
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

/** 
 * Returns the effective role for a user in a specific branch.
 * Falls back to 'agent' if no access record is provided.
 */
export function getEffectiveRole(access: { role: UserRole } | null | undefined): UserRole {
  return access?.role || 'agent';
}

// ============================================================
// User Management Permissions
// ============================================================

/** Returns true if the role is allowed to manage users (CRUD) at all */
export function canManageUsers(role: UserRole): boolean {
  return role === 'super_admin' || role === 'dev_manager';
}

/** Returns true if the role is allowed to delete users (full delete, not just deactivate) */
export function canDeleteUsers(role: UserRole): boolean {
  // ✅ Super Admin و مدير التطوير فقط يمكنهم حذف المستخدمين نهائياً،
  // بما يطابق سياسة profiles_delete في قاعدة البيانات.
  return role === 'super_admin' || role === 'dev_manager';
}

/** Returns true if the role is allowed to reset another user's password */
export function canResetPasswords(role: UserRole): boolean {
  return ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'].includes(role);
}

/** Roles the current user is allowed to assign when creating/editing users */
export function assignableRoles(myRole: UserRole): UserRole[] {
  const all: UserRole[] = ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'];
  if (myRole === 'super_admin') return all;
  if (myRole === 'dev_manager') return all.filter(r => r !== 'super_admin');
  return all.filter(r => ROLE_LEVELS[r] > ROLE_LEVELS[myRole]);
}

// ============================================================
// Navigation Permissions - Role-Based Navigation
// ============================================================
// ✅ تعتمد فقط على profiles.role — هذا هو نفس المنطق الذي يُستخدم في
// PermissionGuard (App.tsx) و Sidebar.tsx، بعد إصلاح التعارض الذي كان
// يجعل PermissionGuard يعتمد على activeBranchAccess.role بدل profile.role.

/** Returns true if user can access a specific page */
export function canAccessPage(role: UserRole | null, pagePath: string): boolean {
  if (!role) return false;

  // ✅ Super Admin و Dev Manager لديهم وصول كامل لجميع الصفحات
  if (role === 'super_admin' || role === 'dev_manager') {
    return true;
  }

  const pagePermissions: Record<string, UserRole[]> = {
    '/': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'],
    '/users': ['super_admin', 'dev_manager'],
    '/branches': ['super_admin', 'dev_manager'],
    '/branch-access': ['super_admin', 'dev_manager'],
    '/org': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'],
    '/clients': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'],
    '/policies': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'],
    '/collections': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'],
    '/targets': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'],
    '/tasks': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'],
    '/notifications': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader', 'agent'],
    '/closing': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor'],
    '/reports': ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'],
    '/audit': ['super_admin', 'dev_manager', 'general_supervisor'],
    '/settings': ['super_admin', 'dev_manager'],
  };

  const allowedRoles = pagePermissions[pagePath];
  return allowedRoles ? allowedRoles.includes(role) : false;
}
