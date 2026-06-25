import { supabase } from '../lib/supabase';

/**
 * Service for handling reports and performance calculations
 */

export interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  new_business: number;
  collections: number;
  total: number;
  collection_count: number;
  target?: number;
  achievement_rate?: number;
}

export interface BranchPerformance {
  branch_id: string;
  branch_name: string;
  new_business: number;
  collections: number;
  total: number;
  agent_count: number;
  collection_count: number;
  target?: number;
  achievement_rate?: number;
}

/**
 * Calculate agent performance for a specific month
 */
export async function calculateAgentPerformance(
  agent_id: string,
  month: number,
  year: number
): Promise<{ success: boolean; data?: AgentPerformance; error?: string }> {
  try {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Get agent info
    const { data: agent, error: agentError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', agent_id)
      .single();

    if (agentError) {
      return { success: false, error: `خطأ في جلب بيانات المندوب: ${agentError.message}` };
    }

    // Get collections using unified metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('unified_performance_metrics')
      .select('amount, is_new_business, is_first_year_collection')
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd)
      .eq('agent_id', agent_id);

    if (metricsError) {
      return { success: false, error: `خطأ في جلب البيانات: ${metricsError.message}` };
    }

    // Calculate totals
    const new_business = metrics
      ?.filter(m => m.is_new_business)
      .reduce((sum, m) => sum + Number(m.amount), 0) || 0;

    const collections_total = metrics
      ?.filter(m => !m.is_new_business && m.is_first_year_collection)
      .reduce((sum, m) => sum + Number(m.amount), 0) || 0;

    const total = new_business + collections_total;

    // Get target (fixed query)
    const { data: targetData } = await supabase
      .from('targets')
      .select('target_amount')
      .eq('user_id', agent_id)
      .eq('period_number', month)
      .eq('year', year)
      .eq('period_type', 'monthly')
      .single();

    const target = targetData?.target_amount || 0;
    const achievement_rate = target > 0 ? (total / target) * 100 : 0;

    return {
      success: true,
      data: {
        agent_id,
        agent_name: agent?.full_name || 'Unknown',
        new_business,
        collections: collections_total,
        total,
        collection_count: metrics?.length || 0,
        target,
        achievement_rate,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'خطأ غير معروف',
    };
  }
}

/**
 * Calculate branch performance for a specific month
 */
export async function calculateBranchPerformance(
  branch_id: string,
  month: number,
  year: number
): Promise<{ success: boolean; data?: BranchPerformance; error?: string }> {
  try {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Get branch info
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('id, name')
      .eq('id', branch_id)
      .single();

    if (branchError) {
      return { success: false, error: `خطأ في جلب بيانات الفرع: ${branchError.message}` };
    }

    // Get all agents in this branch
    const { data: agents, error: agentsError } = await supabase
      .from('profiles')
      .select('id')
      .eq('active_branch_id', branch_id);

    if (agentsError) {
      return { success: false, error: `خطأ في جلب المندوبين: ${agentsError.message}` };
    }

    const agentIds = agents?.map(a => a.id) || [];

    // Get collections using unified metrics
    const { data: metrics, error: metricsError } = await supabase
      .from('unified_performance_metrics')
      .select('amount, is_new_business, is_first_year_collection')
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd)
      .in('agent_id', agentIds);

    if (metricsError) {
      return { success: false, error: `خطأ في جلب البيانات: ${metricsError.message}` };
    }

    // Calculate totals
    const new_business = metrics
      ?.filter(m => m.is_new_business)
      .reduce((sum, m) => sum + Number(m.amount), 0) || 0;

    const collections_total = metrics
      ?.filter(m => !m.is_new_business && m.is_first_year_collection)
      .reduce((sum, m) => sum + Number(m.amount), 0) || 0;

    const total = new_business + collections_total;

    // Get target (fixed query)
    const { data: targetData } = await supabase
      .from('targets')
      .select('target_amount')
      .in('user_id', agentIds)
      .eq('period_number', month)
      .eq('year', year)
      .eq('period_type', 'monthly');

    const target = targetData?.reduce((sum, t) => sum + Number(t.target_amount), 0) || 0;
    const achievement_rate = target > 0 ? (total / target) * 100 : 0;

    return {
      success: true,
      data: {
        branch_id,
        branch_name: branch?.name || 'Unknown',
        new_business,
        collections: collections_total,
        total,
        agent_count: agentIds.length,
        collection_count: metrics?.length || 0,
        target,
        achievement_rate,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'خطأ غير معروف',
    };
  }
}

/**
 * Get all agents' performance for a month
 */
export async function getAllAgentsPerformance(
  month: number,
  year: number,
  branchId?: string
): Promise<{ success: boolean; data?: AgentPerformance[]; error?: string }> {
  try {
    let agentsQuery = supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .eq('role', 'agent');

    if (branchId) {
      agentsQuery = agentsQuery.eq('active_branch_id', branchId);
    }

    const { data: agents, error: agentsError } = await agentsQuery;

    if (agentsError) {
      return { success: false, error: `خطأ في جلب المندوبين: ${agentsError.message}` };
    }

    if (!agents || agents.length === 0) {
      return { success: true, data: [] };
    }

    // Calculate performance for each agent
    const performances: AgentPerformance[] = [];

    for (const agent of agents) {
      const result = await calculateAgentPerformance(agent.id, month, year);
      if (result.success && result.data) {
        performances.push(result.data);
      }
    }

    return { success: true, data: performances };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'خطأ غير معروف',
    };
  }
}
