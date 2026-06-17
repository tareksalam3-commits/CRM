import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatPercent, formatNumber } from '../../lib/utils';
import { ROLE_LABELS } from '../../types';
import PageHeader from '../common/PageHeader';
import {
  LayoutDashboard, Users, FileText, Wallet, TrendingUp,
  UserCircle, Target, AlertCircle, Award, RefreshCw, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
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
  policyStatusDist: { name: string; value: number; color: string }[];
}

const INITIAL_STATS: DashboardStats = {
  totalPremiums: 0, totalCollected: 0, totalDue: 0, totalOverdue: 0,
  clientCount: 0, policyCount: 0, activePolicyCount: 0, expiringPoliciesCount: 0,
  userCount: 0, collectionRate: 0, topAgents: [], policyStatusDist: [],
};

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [policiesRes, clientsRes, collectionsRes, usersRes, installmentsRes] = await Promise.all([
        supabase.from('policies').select('annual_premium, status'),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('collections').select('amount'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('installments').select('amount, status, due_date'),
      ]);

      const policies = policiesRes.data || [];
      const collections = collectionsRes.data || [];
      const installments = installmentsRes.data || [];

      const totalPremiums = policies.reduce((s, p) => s + Number(p.annual_premium), 0);
      const totalCollected = collections.reduce((s, c) => s + Number(c.amount), 0);

      const now = new Date().toISOString().split('T')[0];
      // 30 days from now for "expiring soon" — we use this as due soon threshold
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const thirtyDaysStr = thirtyDaysLater.toISOString().split('T')[0];

      const dueInstallments = installments.filter(i => i.status === 'pending' && i.due_date <= now);
      const overdueInstallments = installments.filter(i => i.status === 'overdue');
      const totalDue = dueInstallments.reduce((s, i) => s + Number(i.amount), 0);
      const totalOverdue = overdueInstallments.reduce((s, i) => s + Number(i.amount), 0);

      const totalInstallmentsAmount = installments.reduce((s, i) => s + Number(i.amount), 0);
      const collectionRate = totalInstallmentsAmount > 0 ? (totalCollected / totalInstallmentsAmount) * 100 : 0;

      const activePolicyCount = policies.filter(p => p.status === 'active').length;

      // Top agents by active policy production
      const { data: topAgentsData } = await supabase
        .from('policies')
        .select('agent_id, annual_premium, agent:profiles!policies_agent_id_fkey(full_name)')
        .eq('status', 'active');

      const agentProduction: Record<string, { name: string; total: number }> = {};
      (topAgentsData || []).forEach((p: any) => {
        if (!agentProduction[p.agent_id]) {
          agentProduction[p.agent_id] = { name: p.agent?.full_name || 'غير محدد', total: 0 };
        }
        agentProduction[p.agent_id].total += Number(p.annual_premium);
      });

      const topAgents = Object.values(agentProduction)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(a => ({ name: a.name, production: a.total }));

      // Expiring policies (active policies with pending installments due in next 30 days)
      const { count: expiringCount } = await supabase
        .from('installments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lte('due_date', thirtyDaysStr)
        .gte('due_date', now);

      // Policy status distribution
      const statusCounts: Record<string, number> = {
        active: 0, under_issuance: 0, suspended: 0, cancelled: 0, rejected: 0,
      };
      policies.forEach(p => { if (statusCounts[p.status] !== undefined) statusCounts[p.status]++; });

      const policyStatusDist = [
        { name: 'سارية', value: statusCounts.active, color: '#10b981' },
        { name: 'تحت الإصدار', value: statusCounts.under_issuance, color: '#f59e0b' },
        { name: 'معلقة', value: statusCounts.suspended, color: '#94a3b8' },
        { name: 'ملغاة', value: statusCounts.cancelled + statusCounts.rejected, color: '#ef4444' },
      ].filter(d => d.value > 0);

      setStats({
        totalPremiums,
        totalCollected,
        totalDue,
        totalOverdue,
        clientCount: clientsRes.count || 0,
        policyCount: policies.length,
        activePolicyCount,
        expiringPoliciesCount: expiringCount || 0,
        userCount: usersRes.count || 0,
        collectionRate,
        topAgents,
        policyStatusDist,
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const kpiCards = [
    {
      label: 'إجمالي الأقساط السنوية',
      value: formatCurrency(stats.totalPremiums),
      icon: FileText, color: 'blue',
      sub: `${stats.policyCount} وثيقة`,
    },
    {
      label: 'إجمالي التحصيل',
      value: formatCurrency(stats.totalCollected),
      icon: Wallet, color: 'emerald',
      sub: `نسبة ${formatPercent(stats.collectionRate)}`,
    },
    {
      label: 'أقساط مستحقة',
      value: formatCurrency(stats.totalDue),
      icon: TrendingUp, color: 'amber',
      sub: 'حتى اليوم',
    },
    {
      label: 'أقساط متأخرة',
      value: formatCurrency(stats.totalOverdue),
      icon: AlertCircle, color: 'red',
      sub: 'تجاوزت الموعد',
    },
    {
      label: 'العملاء',
      value: formatNumber(stats.clientCount),
      icon: UserCircle, color: 'indigo',
      sub: 'عميل مسجّل',
    },
    {
      label: 'وثائق سارية',
      value: formatNumber(stats.activePolicyCount),
      icon: FileText, color: 'cyan',
      sub: `من ${stats.policyCount} إجمالاً`,
    },
    {
      label: 'أقساط مستحقة قريباً',
      value: formatNumber(stats.expiringPoliciesCount),
      icon: Clock, color: 'orange',
      sub: 'خلال 30 يوم',
    },
    {
      label: 'المستخدمين',
      value: formatNumber(stats.userCount),
      icon: Users, color: 'violet',
      sub: 'مستخدم نشط',
    },
  ];

  const colorMap: Record<string, string> = {
    blue:   'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    emerald:'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
    amber:  'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
    red:    'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400',
    cyan:   'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400',
    orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400',
    violet: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
    teal:   'bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400',
  };

  if (loading && !lastUpdated) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        description={`مرحباً ${profile?.full_name || ''} — ${profile ? ROLE_LABELS[profile.role] : ''}`}
        icon={LayoutDashboard}
        actions={
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        }
      />

      {/* Last updated */}
      {lastUpdated && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          آخر تحديث: {lastUpdated.toLocaleTimeString('ar-EG')}
          {' '}· يُحدَّث تلقائياً كل 5 دقائق
        </p>
      )}

      {/* Alert: expiring installments */}
      {stats.expiringPoliciesCount > 0 && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              تنبيه: {stats.expiringPoliciesCount} قسط مستحق خلال 30 يوماً القادمة
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              تابع التحصيل من صفحة إدارة التحصيل لتجنب التأخير
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colorMap[card.color]}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.label}</p>
            {card.sub && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{card.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Agents Bar Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">أعلى المندوبين إنتاجاً</h3>
          </div>
          {stats.topAgents.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.topAgents} layout="vertical" margin={{ right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), 'الإنتاج']}
                  contentStyle={{ fontFamily: 'inherit', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="production" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Award className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد وثائق سارية بعد</p>
              </div>
            </div>
          )}
        </div>

        {/* Collection Distribution Pie Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">توزيع التحصيل</h3>
          </div>
          {(stats.totalCollected > 0 || stats.totalDue > 0 || stats.totalOverdue > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'محصل', value: stats.totalCollected },
                      { name: 'مستحق', value: stats.totalDue },
                      { name: 'متأخر', value: stats.totalOverdue },
                    ].filter(d => d.value > 0)}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {['#10b981', '#f59e0b', '#ef4444'].map((color, idx) => (
                      <Cell key={idx} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), '']}
                    contentStyle={{ fontFamily: 'inherit', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Legend
                    formatter={(v) => <span style={{ fontSize: '12px' }}>{v}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(stats.totalCollected)}</p>
                  <p className="text-slate-500">محصل</p>
                </div>
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="font-bold text-amber-700 dark:text-amber-400">{formatCurrency(stats.totalDue)}</p>
                  <p className="text-slate-500">مستحق</p>
                </div>
                <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="font-bold text-red-700 dark:text-red-400">{formatCurrency(stats.totalOverdue)}</p>
                  <p className="text-slate-500">متأخر</p>
                </div>
              </div>
            </>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد بيانات تحصيل بعد</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Policy Status Distribution */}
      {stats.policyStatusDist.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">توزيع حالات الوثائق</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.policyStatusDist.map((item) => (
              <div
                key={item.name}
                className="text-center p-4 rounded-xl border-2"
                style={{ borderColor: item.color + '40', backgroundColor: item.color + '10' }}
              >
                <p className="text-2xl font-bold mb-1" style={{ color: item.color }}>
                  {item.value}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{item.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stats.policyCount > 0
                    ? `${((item.value / stats.policyCount) * 100).toFixed(0)}%`
                    : '0%'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
