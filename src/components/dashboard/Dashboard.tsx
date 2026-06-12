import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatPercent, formatNumber } from '../../lib/utils';
import { ROLE_LABELS } from '../../types';
import PageHeader from '../common/PageHeader';
import {
  LayoutDashboard, Users, FileText, Wallet, TrendingUp,
  UserCircle, Target, AlertCircle, Award
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalPremiums: number;
  totalCollected: number;
  totalDue: number;
  totalOverdue: number;
  clientCount: number;
  policyCount: number;
  userCount: number;
  collectionRate: number;
  targetAchievement: number;
  topAgents: { name: string; production: number }[];
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalPremiums: 0,
    totalCollected: 0,
    totalDue: 0,
    totalOverdue: 0,
    clientCount: 0,
    policyCount: 0,
    userCount: 0,
    collectionRate: 0,
    targetAchievement: 0,
    topAgents: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
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

      const totalPremiums = policies.reduce((sum, p) => sum + Number(p.annual_premium), 0);
      const totalCollected = collections.reduce((sum, c) => sum + Number(c.amount), 0);

      const now = new Date().toISOString().split('T')[0];
      const dueInstallments = installments.filter(i => i.status === 'pending' && i.due_date <= now);
      const overdueInstallments = installments.filter(i => i.status === 'overdue');
      const totalDue = dueInstallments.reduce((sum, i) => sum + Number(i.amount), 0);
      const totalOverdue = overdueInstallments.reduce((sum, i) => sum + Number(i.amount), 0);

      // BUG FIX: collectionRate should be collected vs. total installments amount, not vs. annual premiums
      const totalInstallmentsAmount = installments.reduce((sum, i) => sum + Number(i.amount), 0);
      const collectionRate = totalInstallmentsAmount > 0 ? (totalCollected / totalInstallmentsAmount) * 100 : 0;

      // BUG FIX #10: Use explicit join alias that matches Supabase foreign key naming
      const { data: topAgentsData } = await supabase
        .from('policies')
        .select('agent_id, annual_premium, agent:profiles!policies_agent_id_fkey(full_name)')
        .eq('status', 'active');

      const agentProduction: Record<string, { name: string; total: number }> = {};
      (topAgentsData || []).forEach((p: any) => {
        const agentId = p.agent_id;
        if (!agentProduction[agentId]) {
          agentProduction[agentId] = { name: p.agent?.full_name || 'غير محدد', total: 0 };
        }
        agentProduction[agentId].total += Number(p.annual_premium);
      });

      const topAgents = Object.values(agentProduction)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(a => ({ name: a.name, production: a.total }));

      setStats({
        totalPremiums,
        totalCollected,
        totalDue,
        totalOverdue,
        clientCount: clientsRes.count || 0,
        policyCount: policies.length,
        userCount: usersRes.count || 0,
        collectionRate,
        targetAchievement: 0,
        topAgents,
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const kpiCards = [
    { label: 'إجمالي الأقساط', value: formatCurrency(stats.totalPremiums), icon: FileText, color: 'blue' },
    { label: 'إجمالي التحصيل', value: formatCurrency(stats.totalCollected), icon: Wallet, color: 'emerald' },
    { label: 'المستحق', value: formatCurrency(stats.totalDue), icon: TrendingUp, color: 'amber' },
    { label: 'المتأخر', value: formatCurrency(stats.totalOverdue), icon: AlertCircle, color: 'red' },
    { label: 'العملاء', value: formatNumber(stats.clientCount), icon: UserCircle, color: 'indigo' },
    { label: 'الوثائق', value: formatNumber(stats.policyCount), icon: FileText, color: 'cyan' },
    { label: 'المستخدمين', value: formatNumber(stats.userCount), icon: Users, color: 'violet' },
    { label: 'نسبة التحصيل', value: formatPercent(stats.collectionRate), icon: Target, color: 'teal' },
  ];

  const iconColorMap: Record<string, string> = {
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
    red: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400',
    cyan: 'bg-cyan-100 dark:bg-cyan-900/50 text-cyan-600 dark:text-cyan-400',
    violet: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
    teal: 'bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400',
  };

  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        description={`مرحباً ${profile?.full_name || ''} - ${profile ? ROLE_LABELS[profile.role] : ''}`}
        icon={LayoutDashboard}
      />

      {/* KPI Cards */}
      {/* BUG FIX #1: Changed w-4.5 h-4.5 (invalid Tailwind) to w-5 h-5 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconColorMap[card.color]}`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>
            <p className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Agents Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">أعلى المندوبين إنتاجاً</h3>
          </div>
          {stats.topAgents.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.topAgents} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="production" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400">
              لا توجد بيانات إنتاج بعد
            </div>
          )}
        </div>

        {/* Collection Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">توزيع التحصيل</h3>
          </div>
          {stats.totalCollected > 0 || stats.totalDue > 0 || stats.totalOverdue > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'محصل', value: stats.totalCollected },
                    { name: 'مستحق', value: stats.totalDue },
                    { name: 'متأخر', value: stats.totalOverdue },
                  ].filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {CHART_COLORS.slice(0, 3).map((color, index) => (
                    <Cell key={index} fill={color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-slate-400">
              لا توجد بيانات تحصيل بعد
            </div>
          )}
          <div className="flex justify-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="w-3 h-3 rounded-full bg-blue-500" /> محصل
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="w-3 h-3 rounded-full bg-emerald-500" /> مستحق
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span className="w-3 h-3 rounded-full bg-amber-500" /> متأخر
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
