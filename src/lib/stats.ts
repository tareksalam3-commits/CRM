import { supabase, type User, type UserRole } from './supabase';
import { getAccessibleUserIds } from './permissions';

export interface DashboardStats {
  totalClients: number;
  totalPolicies: number;
  totalCollections: number;
  monthlyCollections: number;
  monthlyPolicies: number;
  totalDueInstallments: number;
  totalOverdueInstallments: number;
  targetAmount: number;
  achievedAmount: number;
  achievementRate: number;
  bestAgents: { name: string; policies: number; collections: number }[];
  bestGroupLeaders: { name: string; policies: number; collections: number }[];
  bestSupervisors: { name: string; policies: number; collections: number }[];
  generalSupervisorStats: { name: string; policies: number; collections: number } | null;
  devManagerStats: { name: string; policies: number; collections: number } | null;
}

function getStartOfMonth() {
  return new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
}

function getEndOfMonth() {
  return new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();
}

function getStartOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

export async function fetchDashboardStats(user: User): Promise<DashboardStats> {
  const startOfMonth = getStartOfMonth().split('T')[0];
  const endOfMonth = getEndOfMonth().split('T')[0];
  const startOfYear = getStartOfYear();

  // Get all accessible user IDs based on hierarchy
  const accessibleUserIds = await getAccessibleUserIds(user);

  if (accessibleUserIds.length === 0) {
    return {
      totalClients: 0,
      totalPolicies: 0,
      totalCollections: 0,
      monthlyCollections: 0,
      monthlyPolicies: 0,
      totalDueInstallments: 0,
      totalOverdueInstallments: 0,
      targetAmount: 0,
      achievedAmount: 0,
      achievementRate: 0,
      bestAgents: [],
      bestGroupLeaders: [],
      bestSupervisors: [],
      generalSupervisorStats: null,
      devManagerStats: null,
    };
  }

  // Clients count
  const { count: clientsCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .in('agent_id', accessibleUserIds);

  // Policies count
  const { count: policiesCount } = await supabase
    .from('policies')
    .select('*', { count: 'exact', head: true })
    .in('agent_id', accessibleUserIds);

  // Monthly policies
  const { count: monthlyPoliciesCount } = await supabase
    .from('policies')
    .select('*', { count: 'exact', head: true })
    .in('agent_id', accessibleUserIds)
    .gte('created_at', startOfMonth);

  // Get policies for accessible users to calculate collections
  const { data: accessiblePolicies } = await supabase
    .from('policies')
    .select('id')
    .in('agent_id', accessibleUserIds);

  const policyIds = accessiblePolicies?.map(p => p.id) || [];

  // Collections (total)
  let totalCollections = 0;
  if (policyIds.length > 0) {
    const { data: collectionsData } = await supabase
      .from('collections')
      .select('amount')
      .in('policy_id', policyIds);
    totalCollections = collectionsData?.reduce((s, c) => s + (c.amount || 0), 0) || 0;
  }

  // Monthly collections
  let monthlyCollections = 0;
  if (policyIds.length > 0) {
    const { data: monthlyCollData } = await supabase
      .from('collections')
      .select('amount')
      .in('policy_id', policyIds)
      .gte('collection_date', startOfMonth)
      .lte('collection_date', endOfMonth);
    monthlyCollections = monthlyCollData?.reduce((s, c) => s + (c.amount || 0), 0) || 0;
  }

  // Due installments (current month only)
  let dueCount = 0;
  if (policyIds.length > 0) {
    const { count } = await supabase
      .from('installments')
      .select('*', { count: 'exact', head: true })
      .in('policy_id', policyIds)
      .eq('status', 'due')
      .gte('due_date', startOfMonth)
      .lte('due_date', endOfMonth);
    dueCount = count || 0;
  }

  // Overdue installments
  let overdueCount = 0;
  if (policyIds.length > 0) {
    const { count } = await supabase
      .from('installments')
      .select('*', { count: 'exact', head: true })
      .in('policy_id', policyIds)
      .eq('status', 'overdue');
    overdueCount = count || 0;
  }

  // Target
  let targetAmount = 0;
  let achievedAmount = 0;
  const { data: targetData } = await supabase
    .from('targets')
    .select('target_amount, achieved_amount')
    .eq('year', new Date().getFullYear())
    .in('user_id', accessibleUserIds);
  
  if (targetData) {
    targetAmount = targetData.reduce((s, t) => s + (t.target_amount || 0), 0);
    achievedAmount = targetData.reduce((s, t) => s + (t.achieved_amount || 0), 0);
  }
  const achievementRate = targetAmount > 0 ? Math.round((achievedAmount / targetAmount) * 100) : 0;

  // Best agents (for supervisors and above)
  let bestAgents: { name: string; policies: number; collections: number }[] = [];
  if (user.role !== 'agent' && policyIds.length > 0) {
    const { data: agentPolicies } = await supabase
      .from('policies')
      .select('agent_id, users!policies_agent_id_fkey(full_name)')
      .in('id', policyIds);
    
    const agentMap = new Map<string, { name: string; policies: number; collections: number }>();
    (agentPolicies as unknown as { agent_id: string; users?: { full_name: string } }[])?.forEach((p) => {
      const name = p.users?.full_name || 'غير محدد';
      const existing = agentMap.get(p.agent_id) || { name, policies: 0, collections: 0 };
      existing.policies += 1;
      agentMap.set(p.agent_id, existing);
    });
    bestAgents = Array.from(agentMap.values()).sort((a, b) => b.policies - a.policies).slice(0, 5);
  }

  // Best group leaders (for supervisors and above)
  let bestGroupLeaders: { name: string; policies: number; collections: number }[] = [];
  if ((user.role === 'supervisor' || user.role === 'general_supervisor' || user.role === 'dev_manager') && policyIds.length > 0) {
    const { data: glPolicies } = await supabase
      .from('policies')
      .select('group_leader_id, users!policies_group_leader_id_fkey(full_name)')
      .in('id', policyIds);
    
    const glMap = new Map<string, { name: string; policies: number; collections: number }>();
    (glPolicies as unknown as { group_leader_id: string; users?: { full_name: string } }[])?.forEach((p) => {
      if (p.group_leader_id) {
        const name = p.users?.full_name || 'غير محدد';
        const existing = glMap.get(p.group_leader_id) || { name, policies: 0, collections: 0 };
        existing.policies += 1;
        glMap.set(p.group_leader_id, existing);
      }
    });
    bestGroupLeaders = Array.from(glMap.values()).sort((a, b) => b.policies - a.policies).slice(0, 5);
  }

  // Best supervisors (for general supervisor and dev manager)
  let bestSupervisors: { name: string; policies: number; collections: number }[] = [];
  if ((user.role === 'general_supervisor' || user.role === 'dev_manager') && policyIds.length > 0) {
    const { data: supPolicies } = await supabase
      .from('policies')
      .select('supervisor_id, users!policies_supervisor_id_fkey(full_name)')
      .in('id', policyIds);
    
    const supMap = new Map<string, { name: string; policies: number; collections: number }>();
    (supPolicies as unknown as { supervisor_id: string; users?: { full_name: string } }[])?.forEach((p) => {
      if (p.supervisor_id) {
        const name = p.users?.full_name || 'غير محدد';
        const existing = supMap.get(p.supervisor_id) || { name, policies: 0, collections: 0 };
        existing.policies += 1;
        supMap.set(p.supervisor_id, existing);
      }
    });
    bestSupervisors = Array.from(supMap.values()).sort((a, b) => b.policies - a.policies).slice(0, 5);
  }

  return {
    totalClients: clientsCount || 0,
    totalPolicies: policiesCount || 0,
    totalCollections,
    monthlyCollections,
    monthlyPolicies: monthlyPoliciesCount || 0,
    totalDueInstallments: dueCount,
    totalOverdueInstallments: overdueCount,
    targetAmount,
    achievedAmount,
    achievementRate,
    bestAgents,
    bestGroupLeaders,
    bestSupervisors,
    generalSupervisorStats: null,
    devManagerStats: null,
  };
}
