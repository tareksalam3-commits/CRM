import { supabase } from './supabase';
import { Profile, UserRole } from '../types';

export interface BranchScope {
  branchId: string | null;
  role: UserRole;
  userId: string;
  isAllBranches: boolean;
}

export function getBranchScope(profile: Profile, activeBranch: { id: string } | null): BranchScope {
  const role = profile.role;
  const userId = profile.id;
  const isAllBranches = !activeBranch || activeBranch.id === 'all' || role === 'super_admin' || role === 'dev_manager';
  const branchId = isAllBranches ? null : activeBranch?.id ?? profile.active_branch_id;
  return { branchId, role, userId, isAllBranches };
}

export async function getSubordinateIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, manager_id')
    .eq('is_active', true);
  if (!data) return [];
  const ids = new Set<string>();
  const queue = [userId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = data.filter(p => p.manager_id === current);
    for (const child of children) {
      if (!ids.has(child.id)) {
        ids.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return Array.from(ids);
}

export async function getDirectSubordinateIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('manager_id', userId)
    .eq('is_active', true);
  return (data || []).map(p => p.id);
}

export function applyBranchFilter<T extends { branch_id?: string | null }>(
  query: any,
  scope: BranchScope
): any {
  if (!scope.isAllBranches && scope.branchId) {
    return query.eq('branch_id', scope.branchId);
  }
  return query;
}

export function applyRoleFilter(
  query: any,
  scope: BranchScope,
  agentIdColumn = 'agent_id',
  subordinateIds?: string[]
): any {
  if (scope.role === 'agent') {
    return query.eq(agentIdColumn, scope.userId);
  }
  if (scope.role === 'team_leader' && subordinateIds && subordinateIds.length > 0) {
    return query.in(agentIdColumn, subordinateIds);
  }
  return query;
}

export function applyScopedFilters(
  query: any,
  scope: BranchScope,
  agentIdColumn = 'agent_id',
  subordinateIds?: string[]
): any {
  let q = query;
  if (!scope.isAllBranches && scope.branchId) {
    q = q.eq('branch_id', scope.branchId);
  }
  if (scope.role === 'agent') {
    q = q.eq(agentIdColumn, scope.userId);
  } else if (scope.role === 'team_leader' && subordinateIds && subordinateIds.length > 0) {
    q = q.in(agentIdColumn, subordinateIds);
  }
  return q;
}

export function getCurrentMonthRange(): { monthStart: string; monthEnd: string; year: number; month: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { monthStart, monthEnd, year, month };
}

export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const end = new Date(year, month, 0).toISOString().split('T')[0];
  return { start, end };
}
