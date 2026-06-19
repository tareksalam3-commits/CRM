// ============================================================
// Insurance CRM Pro - Types & Constants
// Roles aligned: super_admin > dev_manager > general_supervisor
//                > supervisor > team_leader > agent
// ============================================================

export type UserRole =
  | 'super_admin'
  | 'dev_manager'
  | 'general_supervisor'
  | 'supervisor'
  | 'team_leader'
  | 'branch_manager'
  | 'agent';

export type PolicyStatus = 'under_issuance' | 'active' | 'suspended' | 'cancelled' | 'rejected';
export type PaymentFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
export type InstallmentStatus = 'pending' | 'paid' | 'overdue';
export type TaskStatus = 'new' | 'in_progress' | 'completed' | 'overdue';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';
export type TargetPeriod = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'مسؤول النظام',
  dev_manager: 'مدير التطوير',
  general_supervisor: 'مراقب عام',
  supervisor: 'مراقب',
  team_leader: 'قائد فريق',
  branch_manager: 'مدير فرع',
  agent: 'وكيل',
};

export const ROLE_LEVELS: Record<UserRole, number> = {
  super_admin: 0,
  dev_manager: 1,
  general_supervisor: 2,
  supervisor: 3,
  team_leader: 4,
  branch_manager: 4,
  agent: 5,
};

export const MANAGER_ROLES: UserRole[] = ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'branch_manager', 'team_leader'];

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  under_issuance: 'تحت الإصدار',
  active: 'سارية',
  suspended: 'معلقة',
  cancelled: 'ملغاة',
  rejected: 'مرفوضة',
};

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
};

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  pending: 'قيد الانتظار',
  paid: 'مدفوع',
  overdue: 'متأخر',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'جديدة',
  in_progress: 'قيد المعالجة',
  completed: 'مكتملة',
  overdue: 'متأخرة',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: 'أعزب/عزباء',
  married: 'متزوج/متزوجة',
  divorced: 'مطلق/مطلقة',
  widowed: 'أرمل/أرملة',
};

export const TARGET_PERIOD_LABELS: Record<TargetPeriod, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي',
};

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsuranceGroup {
  id: string;
  name: string;
  manager_id: string | null;
  branch_id: string | null;
  created_at: string;
  manager?: Profile;
  branch?: Branch;
}

export interface UserBranchAccess {
  id: string;
  user_id: string;
  branch_id: string;
  created_at: string;
  branch?: Branch;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  manager_id: string | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  accessible_branches?: Branch[];
}

export interface Client {
  id: string;
  name: string;
  national_id: string | null;
  phone: string;
  phone2: string | null;
  address: string | null;
  job: string | null;
  birth_date: string | null;
  marital_status: MaritalStatus | null;
  notes: string | null;
  agent_id: string;
  branch_id: string | null;
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
  branch_id: string | null;
  group_id: string | null;
  product_id: string | null;
  product: string;
  insurance_company: string;
  coverage_amount: number;
  annual_premium: number;
  issue_date: string;
  start_date: string;
  status: PolicyStatus;
  payment_frequency: PaymentFrequency;
  payment_method: string | null;
  policy_duration: number | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  agent?: Profile;
  branch?: Branch;
  group?: InsuranceGroup;
  installments?: Installment[];
  first_year_start?: string;
  first_year_end?: string;
  has_new_business_counted?: boolean;
}

export interface Installment {
  id: string;
  policy_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: InstallmentStatus;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
  policy?: Policy;
}

export interface Collection {
  id: string;
  installment_id: string;
  policy_id: string;
  amount: number;
  collection_date: string;
  receipt_number: string | null;
  collected_by: string;
  branch_id: string | null;
  notes: string | null;
  created_at: string;
  policy?: Policy;
  collector?: Profile;
  branch?: Branch;
}

export interface Target {
  id: string;
  user_id: string;
  branch_id: string | null;
  period_type: TargetPeriod;
  year: number;
  period_number: number;
  target_amount: number;
  created_at: string;
  updated_at: string;
  user?: Profile;
  branch?: Branch;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  created_by: string;
  client_id: string | null;
  policy_id: string | null;
  branch_id: string | null;
  due_date: string;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  updated_at: string;
  assignee?: Profile;
  creator?: Profile;
  branch?: Branch;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  is_read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  branch_id: string | null;
  created_at: string;
  branch?: Branch;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown> | null;
  created_at: string;
  user?: Profile;
}

export interface MonthClosing {
  id: string;
  month: number;
  year: number;
  branch_id: string | null;
  closed_by: string;
  closed_at: string;
  total_premiums: number;
  total_collections: number;
  collection_rate: number;
  branch?: Branch;
}

export interface SystemSettings {
  id: string;
  key: string;
  value: string | number | boolean | null;
  updated_by: string;
  updated_at: string;
}
