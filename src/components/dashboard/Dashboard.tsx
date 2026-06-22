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
  const { profile, activeBranch } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const branchId = activeBranch?.id;
      const userRole = profile?.role;
      const userId = profile?.id;

      const now_date = new Date();
      const monthStart = new Date(now_date.getFullYear(), now_date.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(now_date.getFullYear(), now_date.getMonth() + 1, 0).toISOString().split('T')[0];

      // Build queries with branch filter
      let policiesQuery = supabase.from('policies').select('annual_premium, status, created_at, branch_id, first_year_end, agent_id');
      let clientsQuery = supabase.from('clients').select('id, branch_id, agent_id', { count: 'exact', head: true });
      let unifiedMetricsQuery = supabase.from('unified_performance_metrics').select('*');
      let installmentsQuery = supabase.from('installments').select('amount, status, due_date, policy:policies!inner(agent_id, branch_id, first_year_end, team_leader_id)');
      let usersQuery = supabase.from('profiles').select('id, role', { count: 'exact', head: true });
      let targetsQuery = supabase.from('targets').select('target_amount, branch_id, user_id').eq('period_type', 'monthly').eq('year', now_date.getFullYear()).eq('period_number', now_date.getMonth() + 1);

      // تطبيق الفلاتر بناءً على الدور (RLS سيقوم بالباقي لكن التصفية هنا تحسن الأداء وتضمن دقة الحسابات)
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

      // 9. Collection Rate Calculation
      const monthlyFirstYearDue = installments.filter((i: any) => {
        const policy = i.policy as any;
        return policy?.first_year_end && i.due_date >= monthStart && i.due_date <= monthEnd && i.due_date <= policy.first_year_end;
      }).reduce((s, i: any) => s + Number(i.amount), 0);

      const collectionRate = monthlyFirstYearDue > 0 ? (monthlyFirstYearCollections / monthlyFirstYearDue) * 100 : 0;

      // 10. Monthly Target Achievement
      const totalTarget = targets?.reduce((s: number, t: any) => s + Number(t.target_amount), 0) || 0;
      const targetAchievement = totalTarget > 0 ? (monthlyNewBusiness / totalTarget) * 100 : 0;

      // ================================================================
      // Calculate Top/Bottom Performers (Only for roles that can see them)
      // ================================================================
      let topAgents: any[] = [];
      let bottomAgents: any[] = [];
      let topTeamLeaders: any[] = [];
      let topGroups: any[] = [];

      if (userRole !== 'agent') {
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
        topAgents = sortedAgents.slice(0, 5);
        bottomAgents = sortedAgents.slice(-5).reverse();

        // Top Team Leaders
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

        topTeamLeaders = teamLeaderStats.sort((a, b) => b.production - a.production).slice(0, 5);

        // Top Groups
        const groupStats: Record<string, number> = {};
        unifiedMetrics.forEach((m: any) => {
          if (m.collection_date >= monthStart && m.collection_date <= monthEnd && m.collection_category === 'new') {
            const tlId = m.team_leader_id || 'unknown';
            groupStats[tlId] = (groupStats[tlId] || 0) + Number(m.amount);
          }
        });

        topGroups = Object.entries(groupStats)
          .map(([tlId, production]) => {
            const tlName = teamLeadersData?.find((tl: any) => tl.id === tlId)?.full_name || 'مجموعة غير معروفة';
            return { name: tlName, production };
          })
          .sort((a, b) => b.production - a.production)
          .slice(0, 5);
      }

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
  }, [activeBranch, profile]);

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
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="إجمالي الإنتاج (الجديد)"
          value={formatCurrency(stats.totalNewBusiness)}
          icon={Award}
          trend={stats.targetAchievement}
          trendLabel="من المستهدف"
          color="blue"
        />
        <MetricCard
          title="إجمالي التحصيلات"
          value={formatCurrency(stats.totalCollections)}
          icon={Wallet}
          trend={stats.collectionRate}
          trendLabel="نسبة التحصيل"
          color="emerald"
        />
        <MetricCard
          title="عدد الوثائق"
          value={formatNumber(stats.policyCount)}
          subValue={`${stats.activePolicyCount} سارية`}
          icon={FileText}
          color="cyan"
        />
        <MetricCard
          title="عدد العملاء"
          value={formatNumber(stats.clientCount)}
          icon={UserCircle}
          color="indigo"
        />
      </div>

      {/* Monthly Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">أداء الشهر الحالي</h3>
              <p className="text-sm text-slate-500">متابعة الإنتاج والتحصيل مقابل المستهدف</p>
            </div>
            <div className="text-left">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatPercent(stats.targetAchievement)}
              </span>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">تحقيق المستهدف</p>
            </div>
          </div>

          <div className="space-y-6">
            <ProgressBar
              label="الإنتاج الجديد"
              current={stats.monthlyNewBusiness}
              target={stats.monthlyTarget}
              color="blue"
            />
            <ProgressBar
              label="التحصيل (سنة أولى)"
              current={stats.monthlyFirstYearCollections}
              color="emerald"
            />
            <ProgressBar
              label="التحصيل (تجديد)"
              current={stats.monthlyRenewalCollections}
              color="amber"
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-t border-slate-100 dark:border-slate-700">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">إجمالي الشهر</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(stats.monthlyTotal)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">المستهدف</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(stats.monthlyTarget)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1">المتبقي</p>
              <p className="text-lg font-bold text-blue-600">{formatCurrency(Math.max(0, stats.monthlyTarget - stats.monthlyNewBusiness))}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">توزيع حالة الوثائق</h3>
          <div className="h-[240px] w-full">
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
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {stats.policyStatusDist.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                </div>
                <span className="font-semibold text-slate-900 dark:text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rankings - Only for non-agents */}
      {profile?.role !== 'agent' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <RankingList title="أفضل الوكلاء" items={stats.topAgents} icon={Award} color="blue" />
          <RankingList title="أفضل رؤساء المجموعات" items={stats.topTeamLeaders} icon={TrendingUp} color="emerald" />
          <RankingList title="أفضل المجموعات" items={stats.topGroups} icon={Users} color="indigo" />
        </div>
      )}

      {/* Footer Info */}
      {lastUpdated && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          <span>آخر تحديث: {lastUpdated.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, subValue, icon: Icon, trend, trendLabel, color }: any) {
  const colors: any = {
    blue: 'from-blue-500 to-blue-600 text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    emerald: 'from-emerald-500 to-emerald-600 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
    cyan: 'from-cyan-500 to-cyan-600 text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20',
    indigo: 'from-indigo-500 to-indigo-600 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${colors[color].split(' ').slice(2).join(' ')}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend !== undefined && (
          <div className="text-left">
            <span className={`text-sm font-bold ${trend >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
              {formatPercent(trend)}
            </span>
            <p className="text-[10px] text-slate-400 font-medium uppercase">{trendLabel}</p>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h4 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</h4>
        {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target, color }: any) {
  const percent = target ? Math.min(100, (current / target) * 100) : 100;
  const colors: any = {
    blue: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    amber: 'bg-amber-500',
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(current)}</span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${colors[color]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function RankingList({ title, items, icon: Icon, color }: any) {
  const colors: any = {
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
    emerald: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-slate-100 dark:border-slate-700">
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-4">
        {items.length > 0 ? (
          items.map((item: any, index: number) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-4">{index + 1}</span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(item.production)}</span>
            </div>
          ))
        ) : (
          <p className="text-center py-4 text-sm text-slate-400">لا توجد بيانات</p>
        )}
      </div>
    </div>
  );
}
