export type UserRole =
  | 'super_admin'
  | 'development_manager'
  | 'general_supervisor'
  | 'supervisor'
  | 'group_leader'
  | 'agent';

export type PolicyStatus = 'pending' | 'active' | 'cancelled' | 'expired';

export type CollectionStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type AuditAction = 'insert' | 'update' | 'delete';

export interface Branch {
  id: string;
  name: string;
  code: string;
  region: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  hire_date: string | null;
  created_at: string;
  updated_at: string;
  branch?: Branch;
}

export interface OrganizationalHierarchy {
  id: string;
  user_id: string;
  parent_id: string | null;
  level: number;
  created_at: string;
  updated_at: string;
  user?: Profile;
  parent?: Profile | null;
}

export interface Client {
  id: string;
  full_name: string;
  national_id: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  birth_date: string | null;
  occupation: string | null;
  agent_id: string;
  branch_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  agent?: Profile;
  branch?: Branch;
}

export interface Policy {
  id: string;
  policy_number: string;
  client_id: string;
  agent_id: string;
  branch_id: string;
  policy_type: string;
  premium_amount: number;
  monthly_premium: number;
  issue_date: string;
  start_date: string;
  end_date: string;
  status: PolicyStatus;
  first_payment_date: string | null;
  first_payment_amount: number | null;
  beneficiary_name: string | null;
  beneficiary_relation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  agent?: Profile;
  branch?: Branch;
}

export interface Collection {
  id: string;
  policy_id: string;
  client_id: string;
  agent_id: string;
  branch_id: string;
  collection_number: number;
  amount: number;
  due_date: string;
  payment_date: string | null;
  status: CollectionStatus;
  payment_method: string | null;
  receipt_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  policy?: Policy;
  client?: Client;
  agent?: Profile;
  branch?: Branch;
}

export interface Target {
  id: string;
  user_id: string;
  branch_id: string | null;
  year: number;
  month: number;
  target_type: string;
  target_amount: number;
  achieved_amount: number;
  target_policies: number;
  achieved_policies: number;
  target_collections: number;
  achieved_collections: number;
  created_at: string;
  updated_at: string;
  user?: Profile;
  branch?: Branch;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
  assigner?: Profile | null;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user?: Profile | null;
}

export interface MonthClosing {
  id: string;
  branch_id: string | null;
  year: number;
  month: number;
  closed_by: string | null;
  closed_at: string;
  is_locked: boolean;
  notes: string | null;
  branch?: Branch | null;
  closer?: Profile | null;
}

export interface SystemSettings {
  id: string;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_policies: number;
  active_policies: number;
  new_policies_this_month: number;
  total_premium: number;
  monthly_premium: number;
  pending_collections: number;
  overdue_collections: number;
  total_agents: number;
  active_agents: number;
  total_clients: number;
  new_clients_this_month: number;
  achievement_percentage: number;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'مدير عام',
  development_manager: 'مدير التطوير',
  general_supervisor: 'المراقب العام',
  supervisor: 'المراقب',
  group_leader: 'رئيس المجموعة',
  agent: 'وكيل',
};

export const ROLE_HIERARCHY: UserRole[] = [
  'super_admin',
  'development_manager',
  'general_supervisor',
  'supervisor',
  'group_leader',
  'agent',
];

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  pending: 'قيد الانتظار',
  active: 'نشط',
  cancelled: 'ملغي',
  expired: 'منتهي',
};

export const COLLECTION_STATUS_LABELS: Record<CollectionStatus, string> = {
  pending: 'قيد الانتظار',
  paid: 'مدفوع',
  overdue: 'متأخر',
  cancelled: 'ملغي',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'جاري',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  info: 'معلومات',
  success: 'نجاح',
  warning: 'تنبيه',
  error: 'خطأ',
};
