import { supabase } from './supabase';
import type { UserRole } from './supabase';

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

function getStartOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}

export async function fetchDashboardStats(userId: string, role: UserRole): Promise<DashboardStats> {
  const startOfMonth = getStartOfMonth();
  const startOfYear = getStartOfYear();

  // Build filters based on role
  let clientFilter: string | null = null;
  let policyFilter: string | null = null;
  let collectionFilter: string | null = null;

  if (role === 'agent') {
    clientFilter = `agent_id.eq.${userId}`;
    policyFilter = `agent_id.eq.${userId}`;
    collectionFilter = `collector_id.eq.${userId}`;
  } else if (role === 'group_leader') {
    clientFilter = `group_leader_id.eq.${userId}`;
    policyFilter = `group_leader_id.eq.${userId}`;
  } else if (role === 'supervisor') {
    clientFilter = `supervisor_id.eq.${userId}`;
    policyFilter = `supervisor_id.eq.${userId}`;
  } else if (role === 'general_supervisor') {
    // Get all supervisors under this general supervisor
    const { data: supervisors } = await supabase.from('users').select('id').eq('manager_id', userId);
    const supervisorIds = supervisors?.map((s) => s.id) || [];
    if (supervisorIds.length > 0) {
      const ids = supervisorIds.join(',');
      clientFilter = `supervisor_id.in.(${ids})`;
      policyFilter = `supervisor_id.in.(${ids})`;
    }
  } else if (role === 'dev_manager') {
    const { data: genSupers } = await supabase.from('users').select('id').eq('manager_id', userId);
    const genSuperIds = genSupers?.map((s) => s.id) || [];
    if (genSuperIds.length > 0) {
      const { data: supervisors } = await supabase.from('users').select('id').in('manager_id', genSuperIds);
      const supervisorIds = supervisors?.map((s) => s.id) || [];
      if (supervisorIds.length > 0) {
        const ids = supervisorIds.join(',');
        clientFilter = `supervisor_id.in.(${ids})`;
        policyFilter = `supervisor_id.in.(${ids})`;
      }
    }
  }

  // Clients count
  let clientsQuery = supabase.from('clients').select('*', { count: 'exact', head: true });
  if (clientFilter) clientsQuery = clientsQuery.or(clientFilter);
  const { count: clientsCount } = await clientsQuery;

  // Policies count
  let policiesQuery = supabase.from('policies').select('*', { count: 'exact', head: true });
  if (policyFilter) policiesQuery = policiesQuery.or(policyFilter);
  const { count: policiesCount } = await policiesQuery;

  // Monthly policies
  let monthlyPoliciesQuery = supabase.from('policies').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth);
  if (policyFilter) monthlyPoliciesQuery = monthlyPoliciesQuery.or(policyFilter);
  const { count: monthlyPoliciesCount } = await monthlyPoliciesQuery;

  // Collections
  let collectionsQuery = supabase.from('collections').select('amount');
  if (collectionFilter) collectionsQuery = collectionsQuery.eq('collector_id', userId);
  else if (policyFilter) {
    // For roles without direct collection filter, get collections via policies
    const { data: policyIds } = await supabase.from('policies').select('id').or(policyFilter);
    const ids = policyIds?.map((p) => p.id) || [];
    if (ids.length > 0) collectionsQuery = collectionsQuery.in('policy_id', ids);
  }
  const { data: collectionsData } = await collectionsQuery;
  const totalCollections = collectionsData?.reduce((s, c) => s + (c.amount || 0), 0) || 0;

  // Monthly collections
  let monthlyCollQuery = supabase.from('collections').select('amount').gte('collection_date', startOfMonth.split('T')[0]);
  if (collectionFilter) monthlyCollQuery = monthlyCollQuery.eq('collector_id', userId);
  const { data: monthlyCollData } = await monthlyCollQuery;
  const monthlyCollections = monthlyCollData?.reduce((s, c) => s + (c.amount || 0), 0) || 0;

  // Due installments
  let dueQuery = supabase.from('installments').select('*', { count: 'exact', head: true }).eq('status', 'due');
  if (policyFilter) {
    const { data: policyIds } = await supabase.from('policies').select('id').or(policyFilter);
    const ids = policyIds?.map((p) => p.id) || [];
    if (ids.length > 0) dueQuery = dueQuery.in('policy_id', ids);
  }
  const { count: dueCount } = await dueQuery;

  // Overdue installments
  let overdueQuery = supabase.from('installments').select('*', { count: 'exact', head: true }).eq('status', 'overdue');
  if (policyFilter) {
    const { data: policyIds } = await supabase.from('policies').select('id').or(policyFilter);
    const ids = policyIds?.map((p) => p.id) || [];
    if (ids.length > 0) overdueQuery = overdueQuery.in('policy_id', ids);
  }
  const { count: overdueCount } = await overdueQuery;

  // Target
  let targetQuery = supabase.from('targets').select('target_amount, achieved_amount').eq('year', new Date().getFullYear());
  if (role === 'agent') targetQuery = targetQuery.eq('user_id', userId);
  const { data: targetData } = await targetQuery;
  const targetAmount = targetData?.reduce((s, t) => s + (t.target_amount || 0), 0) || 0;
  const achievedAmount = targetData?.reduce((s, t) => s + (t.achieved_amount || 0), 0) || 0;
  const achievementRate = targetAmount > 0 ? Math.round((achievedAmount / targetAmount) * 100) : 0;

  // Best agents (for supervisors and above)
  let bestAgents: { name: string; policies: number; collections: number }[] = [];
  if (role !== 'agent') {
    let agentPoliciesQuery = supabase.from('policies').select('agent_id, users!policies_agent_id_fkey(full_name)');
    if (policyFilter) agentPoliciesQuery = agentPoliciesQuery.or(policyFilter);
    const { data: agentPolicies } = await agentPoliciesQuery;
    const agentMap = new Map<string, { name: string; policies: number; collections: number }>();
    (agentPolicies as unknown as { agent_id: string; users?: { full_name: string } }[])?.forEach((p) => {
      const name = p.users?.full_name || 'غير محدد';
      const existing = agentMap.get(p.agent_id) || { name, policies: 0, collections: 0 };
      existing.policies += 1;
      agentMap.set(p.agent_id, existing);
    });
    bestAgents = Array.from(agentMap.values()).sort((a, b) => b.policies - a.policies).slice(0, 5);
  }

  return {
    totalClients: clientsCount || 0,
    totalPolicies: policiesCount || 0,
    totalCollections,
    monthlyCollections,
    monthlyPolicies: monthlyPoliciesCount || 0,
    totalDueInstallments: dueCount || 0,
    totalOverdueInstallments: overdueCount || 0,
    targetAmount,
    achievedAmount,
    achievementRate,
    bestAgents,
    bestGroupLeaders: [],
    bestSupervisors: [],
    generalSupervisorStats: null,
    devManagerStats: null,
  };
}
