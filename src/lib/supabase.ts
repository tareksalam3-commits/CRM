import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'super_admin' | 'dev_manager' | 'general_supervisor' | 'supervisor' | 'group_leader' | 'agent';

export interface User {
  id: string;
  auth_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  manager_id: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  id_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  agent_id: string;
  group_leader_id: string | null;
  supervisor_id: string | null;
  general_supervisor_id: string | null;
  dev_manager_id: string | null;
  created_at: string;
}

export interface PolicyType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Policy {
  id: string;
  policy_number: string;
  client_id: string;
  agent_id: string;
  group_leader_id: string | null;
  supervisor_id: string | null;
  policy_type_id: string;
  issue_date: string;
  start_date: string;
  duration_years: number;
  payment_method: 'annual' | 'semi_annual' | 'quarterly' | 'monthly';
  annual_premium: number;
  periodic_premium: number;
  sum_insured: number;
  status: 'active' | 'paid' | 'cancelled' | 'expired';
  created_at: string;
}

export interface Installment {
  id: string;
  policy_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  insurance_year: number;
  status: 'due' | 'collected' | 'overdue';
  created_at: string;
}

export interface Collection {
  id: string;
  installment_id: string;
  policy_id: string;
  client_id: string;
  collector_id: string;
  collection_date: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface Target {
  id: string;
  user_id: string;
  year: number;
  month: number;
  target_amount: number;
  target_policies: number;
  achieved_amount: number;
  achieved_policies: number;
  created_at: string;
}

export interface MonthlyClosing {
  id: string;
  year: number;
  month: number;
  closed_by: string;
  closed_at: string;
  total_collections: number;
  total_policies: number;
  notes: string | null;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 6,
  dev_manager: 5,
  general_supervisor: 4,
  supervisor: 3,
  group_leader: 2,
  agent: 1,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  dev_manager: 'مدير التطوير',
  general_supervisor: 'المراقب العام',
  supervisor: 'المراقب',
  group_leader: 'رئيس المجموعة',
  agent: 'وكيل',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  annual: 'سنوي',
  semi_annual: 'نصف سنوي',
  quarterly: 'ربع سنوي',
  monthly: 'شهري',
};

export const POLICY_STATUS_LABELS: Record<string, string> = {
  active: 'نشط',
  paid: 'مدفوع بالكامل',
  cancelled: 'ملغى',
  expired: 'منتهي',
};

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  due: 'مستحق',
  collected: 'تم التحصيل',
  overdue: 'متأخر',
};

export function canManageRole(currentRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_HIERARCHY[currentRole] > ROLE_HIERARCHY[targetRole];
}

export async function resolveHierarchy(userId: string): Promise<{ group_leader_id: string | null; supervisor_id: string | null; general_supervisor_id: string | null; dev_manager_id: string | null }> {
  const hierarchy = {
    group_leader_id: null as string | null,
    supervisor_id: null as string | null,
    general_supervisor_id: null as string | null,
    dev_manager_id: null as string | null,
  };

  const { data: user } = await supabase.from('users').select('id, role, manager_id').eq('id', userId).maybeSingle();
  if (!user) return hierarchy;

  // If the user itself has a role, set it in the hierarchy
  if (user.role === 'group_leader') hierarchy.group_leader_id = user.id;
  else if (user.role === 'supervisor') hierarchy.supervisor_id = user.id;
  else if (user.role === 'general_supervisor') hierarchy.general_supervisor_id = user.id;
  else if (user.role === 'dev_manager') hierarchy.dev_manager_id = user.id;

  let currentManagerId = user.manager_id;
  while (currentManagerId) {
    const { data: manager } = await supabase.from('users').select('id, role, manager_id').eq('id', currentManagerId).maybeSingle();
    if (!manager) break;

    if (manager.role === 'group_leader' && !hierarchy.group_leader_id) hierarchy.group_leader_id = manager.id;
    else if (manager.role === 'supervisor' && !hierarchy.supervisor_id) hierarchy.supervisor_id = manager.id;
    else if (manager.role === 'general_supervisor' && !hierarchy.general_supervisor_id) hierarchy.general_supervisor_id = manager.id;
    else if (manager.role === 'dev_manager' && !hierarchy.dev_manager_id) hierarchy.dev_manager_id = manager.id;

    currentManagerId = manager.manager_id;
  }

  return hierarchy;
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] || role;
}
