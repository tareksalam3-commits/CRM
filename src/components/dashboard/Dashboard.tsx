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
  monthlyCollections: number;
  monthlyTotal: number;
  monthlyTarget: number;
  error?: string;
}

const INITIAL_STATS: DashboardStats = {
  totalNewBusiness: 0, totalCollections: 0, totalProduction: 0, totalDue: 0, totalOverdue: 0,
  clientCount: 0, policyCount: 0, activePolicyCount: 0, expiringPoliciesCount: 0,
  userCount: 0, collectionRate: 0, topAgents: [], bottomAgents: [], topTeamLeaders: [], topGroups: [],
  policyStatusDist: [], targetAchievement: 0, monthlyNewBusiness: 0, monthlyCollections: 0, monthlyTotal: 0,
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
      // Get active branch ID for filtering
      const branchId = activeBranch?.id;
      if (!branchId && profile?.role !== 'super_admin') {
        throw new Error('لم يتم تحديد فرع نشط');
      }

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

      // Apply branch filter if not super admin
      if (branchId) {
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

      // 1. Total New Business (all time, first installments only)
      const totalNewBusiness = unifiedMetrics
        .filter((m: any) => m.is_new_business)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 2. Total Collections (all time, subsequent installments in first year only)
      const totalCollections = unifiedMetrics
        .filter((m: any) => !m.is_new_business && m.is_first_year_collection)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 3. Total Production = New Business + Collections
      const totalProduction = totalNewBusiness + totalCollections;

      // 4. Monthly New Business (this month)
      const monthlyNewBusiness = unifiedMetrics
        .filter((m: any) => m.is_new_business && m.collection_date >= monthStart && m.collection_date <= monthEnd)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      // 5. Monthly Collections (this month, first year only)
      const monthlyCollections = unifiedMetrics
        .filter((m: any) => !m.is_new_business && m.is_first_year_collection && m.collection_date >= monthStart && m.collection_date <= monthEnd)
        .reduce((s, m: any) => s + Number(m.amount), 0);

      const monthlyTotal = monthlyNewBusiness + monthlyCollections;

      // 6. Collection Rate Calculation
      // المحصل فعلياً خلال الشهر ÷ المستحق خلال نفس الشهر × 100
      const monthlyDue = installments.filter((i: any) => {
        const policy = i.policy as any;
        return policy?.first_year_end && i.due_date >= monthStart && i.due_date <= monthEnd && i.due_date <= policy.first_year_end;
      }).reduce((s, i: any) => s + Number(i.amount), 0);

      const collectionRate = monthlyDue > 0 ? (monthlyCollections / monthlyDue) * 100 : 0;

      // 7. Monthly Target Achievement
      const totalTarget = targets?.reduce((s: number, t: any) => s + Number(t.target_amount), 0) || 0;
      const targetAchievement = totalTarget > 0 ? (monthlyTotal / totalTarget) * 100 : 0;

      // ================================================================
      // Calculate Top/Bottom Performers (Agents only, excluding managers)
      // ================================================================
      let agentsQuery = supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true);

      // Filter by branch if not super admin
      if (branchId) {
        agentsQuery = agentsQuery.eq('branch_id', branchId);
      }

      const { data: agentsData } = await agentsQuery;

      // Filter to only agents (not managers, supervisors, etc.)
      const agents = (agentsData || []).filter((a: any) => a.role === 'agent');

      const agentStats = agents.map((agent: any) => {
        const agentMetrics = unifiedMetrics.filter((m: any) =>
          m.agent_id === agent.id &&
          m.collection_date >= monthStart &&
          m.collection_date <= monthEnd &&
          (m.is_new_business || m.is_first_year_collection)
        );
        const production = agentMetrics.reduce((s, m: any) => s + Number(m.amount), 0);
        return { name: agent.full_name, production };
      });

      const sortedAgents = agentStats.sort((a, b) => b.production - a.production);
      const topAgents = sortedAgents.slice(0, 5);
      const bottomAgents = sortedAgents.slice(-5).reverse();

      // ================================================================
      // Top Team Leaders
      // ================================================================
      let teamLeadersQuery = supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .eq('role', 'team_leader');

      if (branchId) {
        teamLeadersQuery = teamLeadersQuery.eq('branch_id', branchId);
      }

      const { data: teamLeadersData } = await teamLeadersQuery;

      const teamLeaderStats = (teamLeadersData || []).map((tl: any) => {
        const tlMetrics = unifiedMetrics.filter((m: any) =>
          m.team_leader_id === tl.id &&
          m.collection_date >= monthStart &&
          m.collection_date <= monthEnd &&
          (m.is_new_business || m.is_first_year_collection)
        );
        const production = tlMetrics.reduce((s, m: any) => s + Number(m.amount), 0);
        return { name: tl.full_name, production };
      });

      const topTeamLeaders = teamLeaderStats.sort((a, b) => b.production - a.production).slice(0, 5);

      // ================================================================
      // Top Groups (by team leader)
      // ================================================================
      const groupStats: Record<string, number> = {};
      unifiedMetrics.forEach((m: any) => {
        if (m.collection_date >= monthStart && m.collection_date <= monthEnd && (m.is_new_business || m.is_first_year_collection)) {
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

      // ================================================================
      // Policy Status Distribution
      // ================================================================
      const policyStatusDist = Object.entries(POLICY_COLORS).map(([status, color]) => ({
        name: POLICY_STATUS_LABELS[status as keyof typeof POLICY_STATUS_LABELS] || status,
        value: (policies || []).filter((p: any) => p.status === status).length,
        color,
      }));

      // ================================================================
      // Other Metrics
      // ================================================================
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
        monthlyCollections,
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
    <div>
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

      {lastUpdated && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG')}
        </p>
      )}

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label="إجمالي الإنتاج"
          value={formatCurrency(stats.totalProduction)}
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          label="إجمالي الجديد"
          value={formatCurrency(stats.totalNewBusiness)}
          icon={FileText}
          color="emerald"
        />
        <KPICard
          label="إجمالي التحصيل"
          value={formatCurrency(stats.totalCollections)}
          icon={Wallet}
          color="purple"
        />
        <KPICard
          label="نسبة تحقيق الهدف"
          value={formatPercent(stats.targetAchievement)}
          icon={Target}
          color="amber"
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatBox label="المستهدف الشهري" value={formatCurrency(stats.monthlyTarget)} icon={Target} />
        <StatBox label="المحقق الشهري" value={formatCurrency(stats.monthlyTotal)} icon={TrendingUp} />
        <StatBox label="عدد الوثائق الجديدة" value={formatNumber(stats.policyCount)} icon={FileText} />
        <StatBox label="عدد العملاء الجدد" value={formatNumber(stats.clientCount)} icon={Users} />
        <StatBox label="عدد التحصيلات" value={formatNumber(stats.activePolicyCount)} icon={Wallet} />
        <StatBox label="معدل التحصيل" value={formatPercent(stats.collectionRate)} icon={Target} />
      </div>

      {/* Monthly Performance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl shadow-sm border border-blue-200 dark:border-blue-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">الأعمال الجديدة (هذا الشهر)</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">{formatCurrency(stats.monthlyNewBusiness)}</p>
            </div>
            <TrendingUp className="w-12 h-12 text-blue-300 dark:text-blue-600" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl shadow-sm border border-green-200 dark:border-green-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">التحصيل (هذا الشهر)</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-2">{formatCurrency(stats.monthlyCollections)}</p>
            </div>
            <Wallet className="w-12 h-12 text-green-300 dark:text-green-600" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-xl shadow-sm border border-purple-200 dark:border-purple-700 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">نسبة تحقيق الهدف</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-2">{formatPercent(stats.targetAchievement)}</p>
            </div>
            <Target className="w-12 h-12 text-purple-300 dark:text-purple-600" />
          </div>
        </div>
      </div>

      {/* Charts and Performance Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Policy Status Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">توزيع حالات الوثائق</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.policyStatusDist.filter(item => item.value > 0)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {stats.policyStatusDist.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any) => formatNumber(Number(value || 0))} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Agents */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">أعلى 5 وكلاء</h3>
          <div className="space-y-3">
            {stats.topAgents.map((agent, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{agent.name}</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(agent.production)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team Leaders and Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Team Leaders */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">أعلى رؤساء مجموعات</h3>
          <div className="space-y-3">
            {stats.topTeamLeaders.map((tl, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{tl.name}</span>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{formatCurrency(tl.production)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Best Groups */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">أفضل مجموعات إنتاجية</h3>
          <div className="space-y-3">
            {stats.topGroups.map((group, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <span className="text-sm font-medium text-slate-900 dark:text-white">{group.name}</span>
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{formatCurrency(group.production)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-700',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  };

  return (
    <div className={`${colorClasses[color]} border rounded-xl shadow-sm p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
        </div>
        <Icon className="w-12 h-12 opacity-20" />
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
      <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{label}</p>
      <p className="text-lg font-bold text-slate-900 dark:text-white mt-2">{value}</p>
    </div>
  );
}

function renderCustomLabel(entry: any) {
  return `${entry.name} (${entry.value})`;
}
