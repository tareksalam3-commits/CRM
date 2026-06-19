import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatPercent, formatNumber } from '../../lib/utils';
import { POLICY_STATUS_LABELS } from '../../types';
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
  totalPremiums: number;
  totalCollected: number;
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
  policyStatusDist: { name: string; value: number; color: string }[];
  targetAchievement: number;
  monthlyNewBusiness: number;
  monthlyCollections: number;
  error?: string;
}

const INITIAL_STATS: DashboardStats = {
  totalPremiums: 0, totalCollected: 0, totalDue: 0, totalOverdue: 0,
  clientCount: 0, policyCount: 0, activePolicyCount: 0, expiringPoliciesCount: 0,
  userCount: 0, collectionRate: 0, topAgents: [], bottomAgents: [], policyStatusDist: [],
  targetAchievement: 0, monthlyNewBusiness: 0, monthlyCollections: 0,
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
      // Use active branch for filtering
      let branchFilter: string[] = [];
      if (activeBranch) {
        branchFilter = [activeBranch.id];
      }

      // Apply RLS implicitly, but we can also add explicit filters if needed
      let policiesQuery = supabase.from('policies').select('annual_premium, status, created_at, branch_id');
      let clientsQuery = supabase.from('clients').select('id, branch_id', { count: 'exact', head: true });
      let collectionsQuery = supabase.from('collections').select('amount, created_at, is_new_business, branch_id');
      let usersQuery = supabase.from('profiles').select('id', { count: 'exact', head: true });
      let installmentsQuery = supabase.from('installments').select('amount, status, due_date, policy:policies!inner(agent_id, branch_id)');

      // Apply branch filters
      if (branchFilter.length > 0) {
        policiesQuery = policiesQuery.in('branch_id', branchFilter);
        clientsQuery = clientsQuery.in('branch_id', branchFilter);
        collectionsQuery = collectionsQuery.in('branch_id', branchFilter);
      }

      const [policiesRes, clientsRes, collectionsRes, usersRes, installmentsRes] = await Promise.all([
        policiesQuery,
        clientsQuery,
        collectionsQuery,
        usersQuery,
        installmentsQuery,
      ]);

      if (policiesRes.error) throw new Error(policiesRes.error.message);
      if (collectionsRes.error) throw new Error(collectionsRes.error.message);
      if (installmentsRes.error) throw new Error(installmentsRes.error.message);

      const policies = policiesRes.data || [];
      const collections = collectionsRes.data || [];
      const installments = installmentsRes.data || [];

      const totalPremiums = installments.reduce((s, i: { amount: number }) => s + Number(i.amount), 0);
      const totalCollected = collections.reduce((s, c: { amount: number }) => s + Number(c.amount), 0);

      // Calculate monthly metrics
      const now_date = new Date();
      const monthStart = new Date(now_date.getFullYear(), now_date.getMonth(), 1).toISOString();
      const monthEnd = new Date(now_date.getFullYear(), now_date.getMonth() + 1, 0).toISOString();
      
      // Calculate monthly new business (collections where is_new_business = true)
      const monthlyNewBusinessData = collections.filter((c: any) => c.created_at >= monthStart && c.created_at <= monthEnd && c.is_new_business);
      const monthlyNewBusiness = monthlyNewBusinessData.reduce((s, c: any) => s + Number(c.amount), 0);
      
      // Calculate monthly collections (collections where is_new_business = false)
      const monthlyCollectionsData = collections.filter((c: any) => c.created_at >= monthStart && c.created_at <= monthEnd && !c.is_new_business);
      const monthlyCollections = monthlyCollectionsData.reduce((s, c: any) => s + Number(c.amount), 0);

      // Get top and bottom agents
      let agentsQuery = supabase
        .from('profiles')
        .select('id, full_name')
        .limit(100);
      
      // Filter agents by active branch is handled by RLS automatically
      
      const { data: agentsData } = await agentsQuery;

      const agentStats = await Promise.all(
        (agentsData || []).map(async (agent: any) => {
          const { data: agentPolicies } = await supabase
            .from('policies')
            .select('annual_premium')
            .eq('agent_id', agent.id);
          const production = agentPolicies?.reduce((s: number, p: any) => s + Number(p.annual_premium), 0) || 0;
          return { name: agent.full_name, production };
        })
      );

      const sortedAgents = agentStats.sort((a, b) => b.production - a.production);
      const topAgents = sortedAgents.slice(0, 5);
      const bottomAgents = sortedAgents.slice(-5).reverse();

      // Calculate target achievement
      let targetQuery = supabase
        .from('targets')
        .select('target_amount, branch_id')
        .eq('period_type', 'monthly')
        .eq('year', now_date.getFullYear())
        .eq('period_number', now_date.getMonth() + 1);
      
      // Filter targets by active branch
      if (branchFilter.length > 0) {
        targetQuery = targetQuery.in('branch_id', branchFilter);
      }
      
      const { data: targetData } = await targetQuery;

      const totalTarget = targetData?.reduce((s: number, t: any) => s + Number(t.target_amount), 0) || 0;
      const targetAchievement = totalTarget > 0 ? (monthlyCollections / totalTarget) * 100 : 0;

      const now = new Date().toISOString().split('T')[0];
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const thirtyDaysStr = thirtyDaysLater.toISOString().split('T')[0];

      const dueInstallments = (installments || []).filter((i: { status: string; due_date: string; amount: number }) => i.status === 'pending' && i.due_date <= now);
      const overdueInstallments = (installments || []).filter((i: { status: string; amount: number }) => i.status === 'overdue');
      const totalDue = dueInstallments.reduce((s, i: { amount: number }) => s + Number(i.amount), 0);
      const totalOverdue = overdueInstallments.reduce((s, i: { amount: number }) => s + Number(i.amount), 0);

      const activePolicies = (policies || []).filter((p: { status: string }) => p.status === 'active');
      const expiringPolicies = (policies || []).filter((p: { status: string; created_at: string }) => {
        const startDate = new Date(p.created_at);
        const oneYearLater = new Date(startDate);
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        return oneYearLater.toISOString().split('T')[0] <= thirtyDaysStr;
      });

      const policyStatusDist = Object.entries(POLICY_COLORS).map(([status, color]) => ({
        name: POLICY_STATUS_LABELS[status as keyof typeof POLICY_STATUS_LABELS] || status,
        value: (policies || []).filter((p: { status: string }) => p.status === status).length,
        color,
      }));

      setStats({
        totalPremiums,
        totalCollected,
        totalDue,
        totalOverdue,
        clientCount: clientsRes.count || 0,
        policyCount: policies.length,
        activePolicyCount: activePolicies.length,
        expiringPoliciesCount: expiringPolicies.length,
        userCount: usersRes.count || 0,
        collectionRate: totalPremiums > 0 ? (totalCollected / totalPremiums) * 100 : 0,
        topAgents,
        bottomAgents,
        policyStatusDist,
        monthlyNewBusiness,
        monthlyCollections,
        targetAchievement,
      });

      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير معروف';
      setStats(prev => ({ ...prev, error: message }));
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          label="إجمالي الإنتاج"
          value={formatCurrency(stats.monthlyCollections)}
          icon={TrendingUp}
          color="blue"
        />
        <KPICard
          label="إجمالي التحصيل"
          value={formatCurrency(stats.totalCollected)}
          icon={Wallet}
          color="emerald"
        />
        <KPICard
          label="المستحق الحالي"
          value={formatCurrency(stats.totalDue)}
          icon={Clock}
          color="amber"
        />
        <KPICard
          label="المتأخر"
          value={formatCurrency(stats.totalOverdue)}
          icon={AlertCircle}
          color="red"
        />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatBox label="العملاء" value={formatNumber(stats.clientCount)} icon={UserCircle} />
        <StatBox label="الوثائق" value={formatNumber(stats.policyCount)} icon={FileText} />
        <StatBox label="الوثائق السارية" value={formatNumber(stats.activePolicyCount)} icon={Award} />
        <StatBox label="ينتهي قريباً" value={formatNumber(stats.expiringPoliciesCount)} icon={Clock} />
        <StatBox label="المستخدمين" value={formatNumber(stats.userCount)} icon={Users} />
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">ملخص التحصيل</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">معدل التحصيل</span>
                <span className="font-semibold text-slate-900 dark:text-white">{formatPercent(stats.collectionRate)}</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(stats.collectionRate, 100)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">المستحق الحالي</p>
                <p className="font-bold text-slate-900 dark:text-white text-lg">{formatCurrency(stats.totalDue)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">المتأخر</p>
                <p className="font-bold text-red-600 dark:text-red-400 text-lg">{formatCurrency(stats.totalOverdue)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top and Bottom Performers - Hidden for agents */}
      {profile?.role !== 'agent' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            أعلى 5 منتجين
          </h3>
          <div className="space-y-3">
            {stats.topAgents.map((agent, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center text-sm font-bold text-amber-700 dark:text-amber-200">
                    {idx + 1}
                  </div>
                  <span className="text-slate-900 dark:text-white font-medium">{agent.name}</span>
                </div>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatCurrency(agent.production)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            أقل 5 منتجين
          </h3>
          <div className="space-y-3">
            {stats.bottomAgents.map((agent, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center text-sm font-bold text-red-700 dark:text-red-200">
                    {idx + 1}
                  </div>
                  <span className="text-slate-900 dark:text-white font-medium">{agent.name}</span>
                </div>
                <span className="text-red-600 dark:text-red-400 font-semibold">{formatCurrency(agent.production)}</span>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-center hover:shadow-md transition-shadow">
      <Icon className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{label}</p>
      <p className="font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCustomLabel(props: any) {
  const { name, value } = props;
  return value > 0 ? name : '';
}
