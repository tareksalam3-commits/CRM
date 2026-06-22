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
  ArrowUpRight, ArrowDownRight, Briefcase, PieChart as PieIcon,
} from 'lucide-react';
import {
  Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#ec4899'];

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
    if (!profile) return;
    setLoading(true);
    try {
      const branchId = activeBranch?.id;
      const userRole = profile?.role;
      const userId = profile?.id;

      const now_date = new Date();
      const monthStart = new Date(now_date.getFullYear(), now_date.getMonth(), 1).toISOString().split('T')[0];
      const monthEnd = new Date(now_date.getFullYear(), now_date.getMonth() + 1, 0).toISOString().split('T')[0];

      // Base Queries
      let policiesQuery = supabase.from('policies').select('annual_premium, status, created_at, branch_id, first_year_end, agent_id');
      let clientsQuery = supabase.from('clients').select('id, branch_id, agent_id', { count: 'exact', head: true });
      let unifiedMetricsQuery = supabase.from('unified_performance_metrics').select('*');
      let installmentsQuery = supabase.from('installments').select('amount, status, due_date, policy:policies!inner(agent_id, branch_id, first_year_end, team_leader_id)');
      let usersQuery = supabase.from('profiles').select('id, role', { count: 'exact', head: true });
      let targetsQuery = supabase.from('targets').select('target_amount, branch_id, user_id').eq('period_type', 'monthly').eq('year', now_date.getFullYear()).eq('period_number', now_date.getMonth() + 1);

      // Apply Filters based on Branch
      if (branchId && branchId !== 'all' && userRole !== 'super_admin' && userRole !== 'dev_manager') {
        policiesQuery = policiesQuery.eq('branch_id', branchId);
        clientsQuery = clientsQuery.eq('branch_id', branchId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('branch_id', branchId);
        targetsQuery = targetsQuery.eq('branch_id', branchId);
      }

      // Role-specific filtering logic
      if (userRole === 'agent') {
        policiesQuery = policiesQuery.eq('agent_id', userId);
        clientsQuery = clientsQuery.eq('agent_id', userId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('agent_id', userId);
        targetsQuery = targetsQuery.eq('user_id', userId);
      } else if (userRole === 'team_leader') {
        // Team Leader sees themselves and their team
        unifiedMetricsQuery = unifiedMetricsQuery.or(`agent_id.eq.${userId},team_leader_id.eq.${userId}`);
      }

      const [policiesRes, clientsRes, unifiedMetricsRes, installmentsRes, usersRes, targetsRes] = await Promise.all([
        policiesQuery,
        clientsQuery,
        unifiedMetricsQuery,
        installmentsQuery,
        usersQuery,
        targetsQuery
      ]);

      if (policiesRes.error) throw policiesRes.error;
      if (unifiedMetricsRes.error) throw unifiedMetricsRes.error;

      const policies = policiesRes.data || [];
      const installments = installmentsRes.data || [];
      const unifiedMetrics = unifiedMetricsRes.data || [];
      const targets = targetsRes.data || [];

      // Calculate core metrics
      const totalNewBusiness = unifiedMetrics.filter((m: any) => m.collection_category === 'new').reduce((s, m: any) => s + Number(m.amount), 0);
      const totalFirstYearCollections = unifiedMetrics.filter((m: any) => m.collection_category === 'first_year').reduce((s, m: any) => s + Number(m.amount), 0);
      const totalRenewalCollections = unifiedMetrics.filter((m: any) => m.collection_category === 'renewal').reduce((s, m: any) => s + Number(m.amount), 0);
      const totalCollections = totalFirstYearCollections + totalRenewalCollections;
      const totalProduction = totalNewBusiness + totalCollections;

      const monthlyNewBusiness = unifiedMetrics.filter((m: any) => m.collection_category === 'new' && m.collection_date >= monthStart && m.collection_date <= monthEnd).reduce((s, m: any) => s + Number(m.amount), 0);
      const monthlyFirstYearCollections = unifiedMetrics.filter((m: any) => m.collection_category === 'first_year' && m.collection_date >= monthStart && m.collection_date <= monthEnd).reduce((s, m: any) => s + Number(m.amount), 0);
      const monthlyRenewalCollections = unifiedMetrics.filter((m: any) => m.collection_category === 'renewal' && m.collection_date >= monthStart && m.collection_date <= monthEnd).reduce((s, m: any) => s + Number(m.amount), 0);
      const monthlyTotal = monthlyNewBusiness + monthlyFirstYearCollections + monthlyRenewalCollections;

      const monthlyFirstYearDue = installments.filter((i: any) => {
        const p = i.policy as any;
        return p?.first_year_end && i.due_date >= monthStart && i.due_date <= monthEnd && i.due_date <= p.first_year_end;
      }).reduce((s, i: any) => s + Number(i.amount), 0);

      const collectionRate = monthlyFirstYearDue > 0 ? (monthlyFirstYearCollections / monthlyFirstYearDue) * 100 : 0;
      const totalTarget = targets?.reduce((s: number, t: any) => s + Number(t.target_amount), 0) || 0;
      const targetAchievement = totalTarget > 0 ? (monthlyNewBusiness / totalTarget) * 100 : 0;

      // Ranking logic
      let topAgents: any[] = [];
      let topTeamLeaders: any[] = [];
      if (userRole !== 'agent') {
        const agentStats: Record<string, { name: string, production: number }> = {};
        const tlStats: Record<string, { name: string, production: number }> = {};

        unifiedMetrics.forEach((m: any) => {
          if (m.collection_date >= monthStart && m.collection_date <= monthEnd && m.collection_category === 'new') {
            if (m.agent_id) {
              if (!agentStats[m.agent_id]) agentStats[m.agent_id] = { name: m.agent_name || 'وكيل', production: 0 };
              agentStats[m.agent_id].production += Number(m.amount);
            }
            if (m.team_leader_id) {
              if (!tlStats[m.team_leader_id]) tlStats[m.team_leader_id] = { name: m.team_leader_name || 'رئيس مجموعة', production: 0 };
              tlStats[m.team_leader_id].production += Number(m.amount);
            }
          }
        });

        topAgents = Object.values(agentStats).sort((a, b) => b.production - a.production).slice(0, 5);
        topTeamLeaders = Object.values(tlStats).sort((a, b) => b.production - a.production).slice(0, 5);
      }

      const policyStatusDist = Object.entries(POLICY_COLORS).map(([status, color]) => ({
        name: POLICY_STATUS_LABELS[status as keyof typeof POLICY_STATUS_LABELS] || status,
        value: policies.filter((p: any) => p.status === status).length,
        color,
      })).filter(item => item.value > 0);

      const now = new Date().toISOString().split('T')[0];
      const dueInstallments = installments.filter((i: any) => i.status === 'pending' && i.due_date <= now);
      const overdueInstallments = installments.filter((i: any) => i.status === 'overdue');
      const totalDue = dueInstallments.reduce((s, i: any) => s + Number(i.amount), 0);
      const totalOverdue = overdueInstallments.reduce((s, i: any) => s + Number(i.amount), 0);

      setStats({
        totalNewBusiness, totalFirstYearCollections, totalRenewalCollections, totalCollections, totalProduction,
        totalDue, totalOverdue, clientCount: clientsRes.count || 0, policyCount: policies.length,
        activePolicyCount: policies.filter((p: any) => p.status === 'active').length,
        expiringPoliciesCount: 0, // Placeholder
        userCount: usersRes.count || 0, collectionRate, topAgents, bottomAgents: [], topTeamLeaders, topGroups: [],
        policyStatusDist, targetAchievement, monthlyNewBusiness, monthlyFirstYearCollections,
        monthlyRenewalCollections, monthlyTotal, monthlyTarget: totalTarget,
      });

      setLastUpdated(new Date());
    } catch (err: any) {
      setStats(prev => ({ ...prev, error: err.message }));
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranch, profile]);

  useEffect(() => { fetchStats(); }, [fetchStats, activeBranch]);

  if (loading) return <LoadingSpinner />;

  if (stats.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">حدث خطأ أثناء تحميل البيانات</h3>
        <p className="text-slate-500 max-w-md mb-6">{stats.error}</p>
        <button onClick={() => fetchStats()} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-200">
          <RefreshCw className="w-4 h-4" />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="لوحة التحكم"
        icon={LayoutDashboard}
        description={`مرحباً ${profile?.full_name} | ${profile?.role}`}
        actions={
          <button onClick={() => fetchStats()} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 hover:text-blue-600 transition-colors shadow-sm">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="الإنتاج الجديد (الشهر)" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" trend={stats.targetAchievement} trendLabel="من المستهدف" />
        <StatCard title="التحصيلات (الشهر)" value={formatCurrency(stats.monthlyTotal - stats.monthlyNewBusiness)} icon={Wallet} color="emerald" trend={stats.collectionRate} trendLabel="نسبة التحصيل" />
        <StatCard title="إجمالي الوثائق" value={formatNumber(stats.policyCount)} icon={FileText} color="indigo" subValue={`${stats.activePolicyCount} وثيقة سارية`} />
        <StatCard title="إجمالي العملاء" value={formatNumber(stats.clientCount)} icon={UserCircle} color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Performance Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تحليل أداء الشهر</h3>
              <p className="text-sm text-slate-500">مقارنة الإنتاج والتحصيل والمستهدف</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full text-sm font-bold">
              <TrendingUp className="w-4 h-4" />
              {formatPercent(stats.targetAchievement)}
            </div>
          </div>
          
          <div className="space-y-8">
            <PerformanceBar label="الإنتاج الجديد" current={stats.monthlyNewBusiness} target={stats.monthlyTarget} color="#3b82f6" />
            <PerformanceBar label="تحصيل سنة أولى" current={stats.monthlyFirstYearCollections} color="#10b981" />
            <PerformanceBar label="تحصيل التجديد" current={stats.monthlyRenewalCollections} color="#f59e0b" />
          </div>

          <div className="grid grid-cols-3 gap-4 mt-10 pt-8 border-t border-slate-50 dark:border-slate-700">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">المستهدف</p>
              <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(stats.monthlyTarget)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">المحقق</p>
              <p className="text-base font-bold text-blue-600">{formatCurrency(stats.monthlyNewBusiness)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">المتبقي</p>
              <p className="text-base font-bold text-slate-900 dark:text-white">{formatCurrency(Math.max(0, stats.monthlyTarget - stats.monthlyNewBusiness))}</p>
            </div>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">حالات الوثائق</h3>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.policyStatusDist} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                  {stats.policyStatusDist.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 mt-6">
            {stats.policyStatusDist.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-slate-600 dark:text-slate-400">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rankings Section - Hidden for Agents */}
      {profile?.role !== 'agent' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <RankingCard title="أفضل الوكلاء (الإنتاج الجديد)" items={stats.topAgents} icon={Award} color="blue" />
          <RankingCard title="أفضل رؤساء المجموعات" items={stats.topTeamLeaders} icon={Users} color="emerald" />
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend, trendLabel, subValue }: any) {
  const colorMap: any = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600',
    violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600',
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-[32px] border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3.5 rounded-2xl ${colorMap[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend !== undefined && (
          <div className="text-left">
            <div className={`flex items-center gap-0.5 text-sm font-bold ${trend >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
              {trend >= 100 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {formatPercent(trend)}
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{trendLabel}</p>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h4 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</h4>
        {subValue && <p className="text-xs text-slate-400 mt-1 font-medium">{subValue}</p>}
      </div>
    </div>
  );
}

function PerformanceBar({ label, current, target, color }: any) {
  const percent = target ? Math.min(100, (current / target) * 100) : 100;
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between items-end">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-base font-black text-slate-900 dark:text-white">{formatCurrency(current)}</span>
      </div>
      <div className="h-3 bg-slate-50 dark:bg-slate-900 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-1000 ease-out shadow-sm"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function RankingCard({ title, items, icon: Icon, color }: any) {
  const colorMap: any = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-[32px] p-6 border border-slate-100 dark:border-slate-700 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2.5 rounded-xl ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-4">
        {items.length > 0 ? items.map((item: any, idx: number) => (
          <div key={idx} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
            <div className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>
                {idx + 1}
              </span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{item.name}</span>
            </div>
            <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(item.production)}</span>
          </div>
        )) : (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400">لا توجد بيانات لهذا الشهر</p>
          </div>
        )}
      </div>
    </div>
  );
}
