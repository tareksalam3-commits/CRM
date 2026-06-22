import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatCurrency, formatPercent, formatNumber,
} from '../../lib/utils';
import { POLICY_STATUS_LABELS, UserRole } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  LayoutDashboard, Users, FileText, Wallet, TrendingUp,
  UserCircle, Target, AlertCircle, Award, RefreshCw, Clock,
} from 'lucide-react';
import {
  Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

interface DashboardStats {
  totalNewBusiness: number;
  totalFirstYearCollections: number;
  totalRenewalCollections: number;
  totalCollections: number;
  totalProduction: number;
  totalDue: number;
  totalOverdue: number;
  clientCount: number;
  policyCount: number;
  activePolicyCount: number;
  expiringPoliciesCount: number;
  userCount: number;
  collectionRate: number;
  topAgents: { name: string; production: number }[];
  bottomAgents: { name: string; production: number }[];
  topTeamLeaders: { name: string; production: number }[];
  topGroups: { name: string; production: number }[];
  policyStatusDist: { name: string; value: number; color: string }[];
  targetAchievement: number;
  monthlyNewBusiness: number;
  monthlyFirstYearCollections: number;
  monthlyRenewalCollections: number;
  monthlyTotal: number;
  monthlyTarget: number;
  error?: string;
}

const INITIAL_STATS: DashboardStats = {
  totalNewBusiness: 0, totalFirstYearCollections: 0, totalRenewalCollections: 0, totalCollections: 0, totalProduction: 0, totalDue: 0, totalOverdue: 0,
  clientCount: 0, policyCount: 0, activePolicyCount: 0, expiringPoliciesCount: 0,
  userCount: 0, collectionRate: 0, topAgents: [], bottomAgents: [], topTeamLeaders: [], topGroups: [],
  policyStatusDist: [], targetAchievement: 0, monthlyNewBusiness: 0, monthlyFirstYearCollections: 0, monthlyRenewalCollections: 0, monthlyTotal: 0,
  monthlyTarget: 0,
};

const POLICY_COLORS: Record<string, string> = {
  active: '#10b981',
  under_issuance: '#3b82f6',
  suspended: '#f59e0b',
  cancelled: '#ef4444',
  rejected: '#6b7280',
};

export default function Dashboard() {
  const { profile, activeBranch, activeBranchAccess } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const branchId = activeBranch?.id;

      const now_date = new Date();
      const monthStart = new Date(now_date.getFullYear(), now_date.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(now_date.getFullYear(), now_date.getMonth() + 1, 0).toISOString().split('T')[0];

      // Build queries with branch filter
      let policiesQuery = supabase.from('policies').select('annual_premium, status, created_at, branch_id, first_year_end');
      let clientsQuery = supabase.from('clients').select('id, branch_id', { count: 'exact', head: true });
      let unifiedMetricsQuery = supabase.from('unified_performance_metrics').select('*');
      let installmentsQuery = supabase.from('installments').select('amount, status, due_date, policy:policies!inner(agent_id, branch_id, first_year_end, team_leader_id)');
      let usersQuery = supabase.from('profiles').select('id', { count: 'exact', head: true });
      let targetsQuery = supabase.from('targets').select('target_amount, branch_id, user_id').eq('period_type', 'monthly').eq('year', now_date.getFullYear()).eq('period_number', now_date.getMonth() + 1);

      if (branchId && branchId !== 'all') {
        policiesQuery = policiesQuery.eq('branch_id', branchId);
        clientsQuery = clientsQuery.eq('branch_id', branchId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('branch_id', branchId);
        targetsQuery = targetsQuery.eq('branch_id', branchId);
      }

      const [policiesRes, clientsRes, unifiedMetricsRes, installmentsRes, usersRes, targetsRes] = await Promise.all([
        policiesQuery,
        clientsQuery,
        unifiedMetricsQuery,
        installmentsQuery,
        usersQuery,
        targetsQuery
      ]);

      if (policiesRes.error) throw new Error(policiesRes.error.message);
      if (unifiedMetricsRes.error) throw new Error(unifiedMetricsRes.error.message);
      if (installmentsRes.error) throw new Error(installmentsRes.error.message);

      const policies = policiesRes.data || [];
      const installments = installmentsRes.data || [];
      const unifiedMetrics = unifiedMetricsRes.data || [];
      const targets = targetsRes.data || [];

      // ================================================================
      // Calculate Metrics from Unified Performance Metrics
      // ================================================================

      // 1. Total New Business (all time)
      const totalNewBusiness = unifiedMetrics
        .filter((m: any) => m.collection_category === 'new')
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 2. Total First Year Collections (all time)
      const totalFirstYearCollections = unifiedMetrics
        .filter((m: any) => m.collection_category === 'first_year')
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 3. Total Renewal Collections (all time)
      const totalRenewalCollections = unifiedMetrics
        .filter((m: any) => m.collection_category === 'renewal')
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 4. Total Collections = All except 'new'
      const totalCollections = totalFirstYearCollections + totalRenewalCollections;

      // 5. Total Production = All payments
      const totalProduction = totalNewBusiness + totalCollections;

      // 6. Monthly New Business (this month)
      const monthlyNewBusiness = unifiedMetrics
        .filter((m: any) => m.collection_category === 'new' && m.collection_date >= monthStart && m.collection_date <= monthEnd)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 7. Monthly First Year Collections
      const monthlyFirstYearCollections = unifiedMetrics
        .filter((m: any) => m.collection_category === 'first_year' && m.collection_date >= monthStart && m.collection_date <= monthEnd)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 8. Monthly Renewal Collections
      const monthlyRenewalCollections = unifiedMetrics
        .filter((m: any) => m.collection_category === 'renewal' && m.collection_date >= monthStart && m.collection_date <= monthEnd)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      const monthlyTotal = monthlyNewBusiness + monthlyFirstYearCollections + monthlyRenewalCollections;

      // 9. Collection Rate Calculation (First Year only as per original logic)
      const monthlyFirstYearDue = installments.filter((i: any) => {
        const policy = i.policy as any;
        return policy?.first_year_end && i.due_date >= monthStart && i.due_date <= monthEnd && i.due_date <= policy.first_year_end;
      }).reduce((s, i: any) => s + Number(i.amount), 0);

      const collectionRate = monthlyFirstYearDue > 0 ? (monthlyFirstYearCollections / monthlyFirstYearDue) * 100 : 0;

      // 10. Monthly Target Achievement (Based on New Business only as per requirement 4)
      const totalTarget = targets?.reduce((s: number, t: any) => s + Number(t.target_amount), 0) || 0;
      const targetAchievement = totalTarget > 0 ? (monthlyNewBusiness / totalTarget) * 100 : 0;

      // ================================================================
      // Calculate Top/Bottom Performers (Based on New Business only)
      // ================================================================
      let agentsQuery = supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true);

      if (branchId && branchId !== 'all') {
        agentsQuery = agentsQuery.eq('active_branch_id', branchId);
      }

      const { data: agentsData } = await agentsQuery;
      const agents = (agentsData || []).filter((a: any) => a.role === 'agent');

      const agentStats = agents.map((agent: any) => {
        const agentMetrics = unifiedMetrics.filter((m: any) =>
          m.agent_id === agent.id &&
          m.collection_date >= monthStart &&
          m.collection_date <= monthEnd &&
          m.collection_category === 'new'
        );
        const production = agentMetrics.reduce((s, m: any) => s + Number(m.amount), 0);
        return { name: agent.full_name, production };
      });

      const sortedAgents = agentStats.sort((a, b) => b.production - a.production);
      const topAgents = sortedAgents.slice(0, 5);
      const bottomAgents = sortedAgents.slice(-5).reverse();

      // ================================================================
      // Top Team Leaders (Based on New Business)
      // ================================================================
      let teamLeadersQuery = supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .eq('role', 'team_leader');

      if (branchId && branchId !== 'all') {
        teamLeadersQuery = teamLeadersQuery.eq('active_branch_id', branchId);
      }

      const { data: teamLeadersData } = await teamLeadersQuery;

      const teamLeaderStats = (teamLeadersData || []).map((tl: any) => {
        const tlMetrics = unifiedMetrics.filter((m: any) =>
          m.team_leader_id === tl.id &&
          m.collection_date >= monthStart &&
          m.collection_date <= monthEnd &&
          m.collection_category === 'new'
        );
        const production = tlMetrics.reduce((s, m: any) => s + Number(m.amount), 0);
        return { name: tl.full_name, production };
      });

      const topTeamLeaders = teamLeaderStats.sort((a, b) => b.production - a.production).slice(0, 5);

      // ================================================================
      // Top Groups (Based on New Business)
      // ================================================================
      const groupStats: Record<string, number> = {};
      unifiedMetrics.forEach((m: any) => {
        if (m.collection_date >= monthStart && m.collection_date <= monthEnd && m.collection_category === 'new') {
          const tlId = m.team_leader_id || 'unknown';
          groupStats[tlId] = (groupStats[tlId] || 0) + Number(m.amount);
        }
      });

      const topGroups = Object.entries(groupStats)
        .map(([tlId, production]) => {
          const tlName = teamLeadersData?.find((tl: any) => tl.id === tlId)?.full_name || 'مجموعة غير معروفة';
          return { name: tlName, production };
        })
        .sort((a, b) => b.production - a.production)
        .slice(0, 5);

      const policyStatusDist = Object.entries(POLICY_COLORS).map(([status, color]) => ({
        name: POLICY_STATUS_LABELS[status as keyof typeof POLICY_STATUS_LABELS] || status,
        value: (policies || []).filter((p: any) => p.status === status).length,
        color,
      }));

      const now = new Date().toISOString().split('T')[0];
      const activePolicies = (policies || []).filter((p: any) => p.status === 'active');
      const expiringPolicies = (policies || []).filter((p: any) => {
        const startDate = new Date(p.created_at);
        const oneYearLater = new Date(startDate);
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        return oneYearLater.toISOString().split('T')[0] <= monthEnd;
      });

      const dueInstallments = (installments || []).filter((i: any) => i.status === 'pending' && i.due_date <= now);
      const overdueInstallments = (installments || []).filter((i: any) => i.status === 'overdue');
      const totalDue = dueInstallments.reduce((s, i: any) => s + Number(i.amount), 0);
      const totalOverdue = overdueInstallments.reduce((s, i: any) => s + Number(i.amount), 0);

      setStats({
        totalNewBusiness,
        totalFirstYearCollections,
        totalRenewalCollections,
        totalCollections,
        totalProduction,
        totalDue,
        totalOverdue,
        clientCount: clientsRes.count || 0,
        policyCount: policies.length,
        activePolicyCount: activePolicies.length,
        expiringPoliciesCount: expiringPolicies.length,
        userCount: usersRes.count || 0,
        collectionRate,
        topAgents,
        bottomAgents,
        topTeamLeaders,
        topGroups,
        policyStatusDist,
        targetAchievement,
        monthlyNewBusiness,
        monthlyFirstYearCollections,
        monthlyRenewalCollections,
        monthlyTotal,
        monthlyTarget: totalTarget,
      });

      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير معروف';
      setStats(prev => ({ ...prev, error: message }));
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranch, profile?.role]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, activeBranch]);

  if (loading) {
    return (
      <>
        <PageHeader
          title="لوحة التحكم"
          icon={LayoutDashboard}
          description={profile ? `مرحباً ${profile.full_name}` : 'جاري التحميل...'}
        />
        <LoadingSpinner />
      </>
    );
  }

  if (stats.error) {
    return (
      <>
        <PageHeader
          title="لوحة التحكم"
          icon={LayoutDashboard}
        />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-200">خطأ في تحميل البيانات</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{stats.error}</p>
            </div>
          </div>
          <button
            onClick={() => fetchStats()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="لوحة التحكم"
        icon={LayoutDashboard}
        description={profile ? `مرحباً ${profile.full_name}` : ''}
        actions={
          <button
            onClick={() => fetchStats()}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">إجمالي الجديد</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalNewBusiness)}</span>
            <span className="text-sm text-slate-500 mt-1">هذا الشهر: {formatCurrency(stats.monthlyNewBusiness)}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <Wallet className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">تحصيل أول سنة</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalFirstYearCollections)}</span>
            <span className="text-sm text-slate-500 mt-1">هذا الشهر: {formatCurrency(stats.monthlyFirstYearCollections)}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
              <Clock className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">تحصيل سنوات تالية</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalRenewalCollections)}</span>
            <span className="text-sm text-slate-500 mt-1">هذا الشهر: {formatCurrency(stats.monthlyRenewalCollections)}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <Target className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">إجمالي التحصيل الكلي</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(stats.totalProduction)}</span>
            <span className="text-sm text-slate-500 mt-1">هذا الشهر: {formatCurrency(stats.monthlyTotal)}</span>
          </div>
        </div>
      </div>

      {/* Target & Achievement Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">هدف الجديد (هذا الشهر)</h3>
            <div className="text-right">
              <span className="text-sm text-slate-500 block">الهدف المطلوب</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(stats.monthlyTarget)}</span>
            </div>
          </div>
          
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">نسبة الإنجاز من الجديد</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatPercent(stats.targetAchievement)}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                <div 
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(stats.targetAchievement, 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-xs text-slate-500 block mb-1">المحقق (جديد)</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(stats.monthlyNewBusiness)}</span>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-xs text-slate-500 block mb-1">المتبقي للهدف</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(Math.max(0, stats.monthlyTarget - stats.monthlyNewBusiness))}</span>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                <span className="text-xs text-slate-500 block mb-1">نسبة التحصيل</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{formatPercent(stats.collectionRate)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-6">توزيع حالات الوثائق</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.policyStatusDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.policyStatusDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {stats.policyStatusDist.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-slate-600 dark:text-slate-400">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performers Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Agents */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              أفضل المندوبين (جديد - هذا الشهر)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">المندوب</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase text-left">إنتاج الجديد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {stats.topAgents.map((agent, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{agent.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(agent.production)}
                    </td>
                  </tr>
                ))}
                {stats.topAgents.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-8 text-center text-slate-500 italic">لا توجد بيانات لهذا الشهر</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Team Leaders */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              أفضل رؤساء المجموعات (جديد - هذا الشهر)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase">رئيس المجموعة</th>
                  <th className="px-6 py-3 text-xs font-medium text-slate-500 uppercase text-left">إنتاج المجموعة (جديد)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {stats.topTeamLeaders.map((tl, index) => (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{tl.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(tl.production)}
                    </td>
                  </tr>
                ))}
                {stats.topTeamLeaders.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-8 text-center text-slate-500 italic">لا توجد بيانات لهذا الشهر</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl">
        <div className="flex items-center gap-4 mb-2 md:mb-0">
          <span>إجمالي العملاء: {formatNumber(stats.clientCount)}</span>
          <span>إجمالي الوثائق: {formatNumber(stats.policyCount)}</span>
          <span>الوثائق السارية: {formatNumber(stats.activePolicyCount)}</span>
        </div>
        {lastUpdated && (
          <span>آخر تحديث: {lastUpdated.toLocaleTimeString('ar-SA')}</span>
        )}
      </div>
    </div>
  );
}
