import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatCurrency, formatPercent, formatNumber,
} from '../../lib/utils';

import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  LayoutDashboard, Users, FileText, Wallet, TrendingUp,
  Award, RefreshCw, BarChart3, PieChart,
} from 'lucide-react';

interface DashboardStats {
  totalNewBusiness: number;
  totalFirstYearCollections: number;
  totalProduction: number;
  clientCount: number;
  policyCount: number;
  activePolicyCount: number;
  collectionRate: number;
  targetAchievement: number;
  monthlyNewBusiness: number;
  monthlyFirstYearCollections: number;
  monthlyTotal: number;
  monthlyTarget: number;
  error?: string;
}

const INITIAL_STATS: DashboardStats = {
  totalNewBusiness: 0, totalFirstYearCollections: 0, totalProduction: 0,
  clientCount: 0, policyCount: 0, activePolicyCount: 0,
  collectionRate: 0, targetAchievement: 0, monthlyNewBusiness: 0, 
  monthlyFirstYearCollections: 0, monthlyTotal: 0, monthlyTarget: 0,
};

export default function Dashboard() {
  const { profile, activeBranch } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [loading, setLoading] = useState(true);
  const [subordinateStats, setSubordinateStats] = useState<any[]>([]);
  const [extraStats, setExtraStats] = useState<any>({});

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

      // Base Queries - Restricted to first year only
      let policiesQuery = supabase.from('policies').select('id, status', { count: 'exact' });
      let clientsQuery = supabase.from('clients').select('id', { count: 'exact' });
      let unifiedMetricsQuery = supabase.from('unified_performance_metrics').select('*').eq('is_first_year_collection', true);

      let targetsQuery = supabase.from('targets').select('target_amount').eq('period_type', 'monthly').eq('year', now_date.getFullYear()).eq('period_number', now_date.getMonth() + 1);

      if (branchId && branchId !== 'all' && userRole !== 'super_admin' && userRole !== 'dev_manager') {
        policiesQuery = policiesQuery.eq('branch_id', branchId);
        clientsQuery = clientsQuery.eq('branch_id', branchId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('branch_id', branchId);
        targetsQuery = targetsQuery.eq('branch_id', branchId);
      }

      if (userRole === 'agent') {
        policiesQuery = policiesQuery.eq('agent_id', userId);
        clientsQuery = clientsQuery.eq('agent_id', userId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('agent_id', userId);
        targetsQuery = targetsQuery.eq('user_id', userId);
      }

      const [policiesRes, clientsRes, metricsRes, targetsRes] = await Promise.all([
        policiesQuery, clientsQuery, unifiedMetricsQuery, targetsQuery
      ]);

      const metrics = metricsRes.data || [];
      const targets = targetsRes.data || [];
      
      const totalNewBusiness = metrics.filter(m => m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
      const totalFirstYearCollections = metrics.filter(m => !m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
      
      const monthlyMetrics = metrics.filter(m => m.collection_date >= monthStart && m.collection_date <= monthEnd);
      const monthlyNewBusiness = monthlyMetrics.filter(m => m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
      const monthlyFirstYearCollections = monthlyMetrics.filter(m => !m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
      
      const monthlyTarget = targets.reduce((s, t) => s + Number(t.target_amount), 0) || 0;

      setStats({
        totalNewBusiness,
        totalFirstYearCollections,
        totalProduction: totalNewBusiness + totalFirstYearCollections,
        clientCount: clientsRes.count || 0,
        policyCount: policiesRes.count || 0,
        activePolicyCount: 0,
        collectionRate: 0,
        targetAchievement: monthlyTarget > 0 ? (monthlyNewBusiness / monthlyTarget) * 100 : 0,
        monthlyNewBusiness,
        monthlyFirstYearCollections,
        monthlyTotal: monthlyNewBusiness + monthlyFirstYearCollections,
        monthlyTarget
      });

      // Fetch subordinate stats for managers
      if (['supervisor', 'team_leader', 'general_supervisor', 'dev_manager', 'super_admin'].includes(userRole)) {
        await fetchManagerData(userId, userRole, monthStart, monthEnd, branchId);
      }

    } catch (err: any) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranch, profile]);

  const fetchManagerData = async (userId: string, role: string, monthStart: string, monthEnd: string, branchId?: string) => {
    try {
      // 1. Get all subordinates recursively or directly depending on role
      // For simplicity in this dashboard, we'll fetch based on manager_id
      const { data: subordinates } = await supabase
        .from('profiles')
        .select('id, full_name, role, manager_id, branch_id');

      if (!subordinates) return;

      // Filter subordinates based on role hierarchy
      let mySubordinates = [];
      if (role === 'team_leader') {
        mySubordinates = subordinates.filter(s => s.manager_id === userId);
      } else if (role === 'supervisor') {
        // Direct (Team Leaders) and Indirect (Agents)
        const teamLeaders = subordinates.filter(s => s.manager_id === userId);
        const agents = subordinates.filter(s => teamLeaders.some(tl => tl.id === s.manager_id));
        mySubordinates = [...teamLeaders, ...agents];
      } else if (role === 'general_supervisor') {
        mySubordinates = subordinates.filter(s => s.branch_id === branchId);
      } else {
        mySubordinates = subordinates;
      }

      // 2. Fetch metrics for all relevant users
      const { data: allMetrics } = await supabase
        .from('unified_performance_metrics')
        .select('*')
        .eq('is_first_year_collection', true)
        .gte('collection_date', monthStart)
        .lte('collection_date', monthEnd);

      const metrics = allMetrics || [];

      // 3. Process data for the specific dashboard requirements
      const userStats = subordinates.map(user => {
        const userMetrics = metrics.filter(m => m.agent_id === user.id);
        const newBiz = userMetrics.filter(m => m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
        const colls = userMetrics.filter(m => !m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
        return { ...user, newBusiness: newBiz, collections: colls, total: newBiz + colls };
      });

      if (role === 'supervisor') {
        const agents = userStats.filter(u => u.role === 'agent' && mySubordinates.some(s => s.id === u.id));
        const leaders = userStats.filter(u => u.role === 'team_leader' && mySubordinates.some(s => s.id === u.id));
        
        setExtraStats({
          topAgents: [...agents].sort((a, b) => b.newBusiness - a.newBusiness).slice(0, 5),
          bottomAgents: [...agents].sort((a, b) => a.newBusiness - b.newBusiness).slice(0, 5),
          topGroups: [...leaders].sort((a, b) => b.total - a.total).slice(0, 5),
          bottomGroups: [...leaders].sort((a, b) => a.total - b.total).slice(0, 5),
        });
        setSubordinateStats(leaders);
      } else if (role === 'general_supervisor') {
        const agents = userStats.filter(u => u.role === 'agent' && u.branch_id === branchId);
        const leaders = userStats.filter(u => u.role === 'team_leader' && u.branch_id === branchId);
        const supervisors = userStats.filter(u => u.role === 'supervisor' && u.branch_id === branchId);

        setExtraStats({
          topAgents: [...agents].sort((a, b) => b.newBusiness - a.newBusiness).slice(0, 5),
          bottomAgents: [...agents].sort((a, b) => a.newBusiness - b.newBusiness).slice(0, 5),
          topLeaders: [...leaders].sort((a, b) => b.total - a.total).slice(0, 5),
          topSupervisors: [...supervisors].sort((a, b) => b.total - a.total).slice(0, 5),
        });
        setSubordinateStats(supervisors);
      } else if (role === 'dev_manager' || role === 'super_admin') {
        const agents = userStats.filter(u => u.role === 'agent');
        const leaders = userStats.filter(u => u.role === 'team_leader');
        const supervisors = userStats.filter(u => u.role === 'supervisor');
        const genSupervisors = userStats.filter(u => u.role === 'general_supervisor');

        // Branch comparison
        const { data: branches } = await supabase.from('branches').select('id, name');
        const branchComparison = (branches || []).map(b => {
          const bMetrics = metrics.filter(m => m.branch_id === b.id);
          const newBiz = bMetrics.filter(m => m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
          const colls = bMetrics.filter(m => !m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
          return { name: b.name, newBusiness: newBiz, collections: colls, total: newBiz + colls };
        });

        setExtraStats({
          topAgents: [...agents].sort((a, b) => b.newBusiness - a.newBusiness).slice(0, 5),
          topLeaders: [...leaders].sort((a, b) => b.total - a.total).slice(0, 5),
          topSupervisors: [...supervisors].sort((a, b) => b.total - a.total).slice(0, 5),
          topGenSupervisors: [...genSupervisors].sort((a, b) => b.total - a.total).slice(0, 5),
          branchComparison: branchComparison.sort((a, b) => b.total - a.total),
        });
      } else if (role === 'team_leader') {
        const agents = userStats.filter(u => u.manager_id === userId);
        setSubordinateStats(agents);
      }

    } catch (err) {
      console.error('Error fetching manager data:', err);
    }
  };

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={`لوحة التحكم - ${profile?.full_name} (السنة الأولى فقط)`}
        icon={LayoutDashboard}
        description={`الدور: ${profile?.role || 'غير محدد'}`}
        actions={
          <button onClick={() => fetchStats()} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
            <RefreshCw className="w-5 h-5" />
          </button>
        }
      />

      {profile?.role === 'agent' && <AgentDashboard stats={stats} />}
      {profile?.role === 'team_leader' && <TeamLeaderDashboard stats={stats} subordinateStats={subordinateStats} />}
      {profile?.role === 'supervisor' && <SupervisorDashboard stats={stats} subordinateStats={subordinateStats} extraStats={extraStats} />}
      {profile?.role === 'general_supervisor' && <GeneralSupervisorDashboard stats={stats} subordinateStats={subordinateStats} extraStats={extraStats} />}
      {profile?.role === 'dev_manager' && <DevManagerDashboard stats={stats} extraStats={extraStats} />}
      {profile?.role === 'super_admin' && <SuperAdminDashboard stats={stats} extraStats={extraStats} />}
    </div>
  );
}

// Common Components
function StatCard({ title, value, icon: Icon, color, trend, trendLabel }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    violet: 'bg-violet-50 text-violet-600',
    green: 'bg-green-50 text-green-600',
  };
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${colors[color] || colors.blue}`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend !== undefined && (
          <div className="text-right">
            <p className="text-xs font-bold text-blue-600">{formatPercent(trend)}</p>
            <p className="text-[10px] text-slate-400">{trendLabel}</p>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-1">{title}</p>
      <p className="text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function RankingTable({ title, data, columns }: { title: string, data: any[], columns: { key: string, label: string, format?: any }[] }) {
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        <Award className="w-5 h-5 text-amber-500" />
        {title}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-xs font-bold text-slate-500">#</th>
              {columns.map(col => <th key={col.key} className="px-4 py-3 text-xs font-bold text-slate-500">{col.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.map((item, idx) => (
              <tr key={item.id || idx} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">{idx + 1}</td>
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-sm ${col.key === 'total' || col.key === 'newBusiness' ? 'font-bold' : ''}`}>
                    {col.format ? col.format(item[col.key]) : item[col.key]}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400">لا توجد بيانات متاحة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Role Dashboards
function AgentDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="الهدف الشهري" value={formatCurrency(stats.monthlyTarget)} icon={Award} color="blue" />
        <StatCard title="المحقق" value={formatCurrency(stats.monthlyTotal)} icon={TrendingUp} color="green" trend={stats.targetAchievement} trendLabel="من الهدف" />
        <StatCard title="الجديد (الشهر)" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="التحصيل (الشهر)" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">ملخص الأداء</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm"><span className="text-slate-500">إجمالي الإنتاج الجديد</span><span className="font-bold">{formatCurrency(stats.totalNewBusiness)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">إجمالي التحصيلات (سنة 1)</span><span className="font-bold">{formatCurrency(stats.totalFirstYearCollections)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">إجمالي الإنتاج</span><span className="font-bold">{formatCurrency(stats.totalProduction)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">الإحصائيات</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm"><span className="text-slate-500">عدد الوثائق</span><span className="font-bold">{formatNumber(stats.policyCount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">عدد العملاء</span><span className="font-bold">{formatNumber(stats.clientCount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">الأقساط المسددة</span><span className="font-bold">{formatNumber(stats.policyCount)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamLeaderDashboard({ stats, subordinateStats }: { stats: DashboardStats; subordinateStats: any[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي المجموعة - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي المجموعة - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="الهدف الشهري" value={formatCurrency(stats.monthlyTarget)} icon={Award} color="blue" />
        <StatCard title="نسبة الإنجاز" value={formatPercent(stats.targetAchievement)} icon={TrendingUp} color="green" />
      </div>
      <RankingTable 
        title="ترتيب الوكلاء في المجموعة" 
        data={subordinateStats} 
        columns={[
          { key: 'full_name', label: 'الوكيل' },
          { key: 'newBusiness', label: 'الجديد', format: formatCurrency },
          { key: 'collections', label: 'التحصيل', format: formatCurrency },
          { key: 'total', label: 'الإجمالي', format: formatCurrency }
        ]} 
      />
    </div>
  );
}

function SupervisorDashboard({ stats, subordinateStats, extraStats }: { stats: DashboardStats; subordinateStats: any[], extraStats: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي الإشراف - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي الإشراف - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="عدد رؤساء المجموعات" value={formatNumber(subordinateStats.length)} icon={Users} color="indigo" />
        <StatCard title="الإنتاج الإجمالي" value={formatCurrency(stats.totalProduction)} icon={TrendingUp} color="green" />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable title="أعلى 5 وكلاء إنتاجاً" data={extraStats.topAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
        <RankingTable title="أقل 5 وكلاء إنتاجاً" data={extraStats.bottomAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable title="أعلى المجموعات أداءً" data={extraStats.topGroups || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
        <RankingTable title="أقل المجموعات أداءً" data={extraStats.bottomGroups || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      </div>
    </div>
  );
}

function GeneralSupervisorDashboard({ stats, subordinateStats, extraStats }: { stats: DashboardStats; subordinateStats: any[], extraStats: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي الفرع - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي الفرع - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="عدد المراقبين" value={formatNumber(subordinateStats.length)} icon={Users} color="indigo" />
        <StatCard title="الإنتاج الإجمالي" value={formatCurrency(stats.totalProduction)} icon={TrendingUp} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable title="أعلى 5 وكلاء على مستوى الفرع" data={extraStats.topAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
        <RankingTable title="أعلى المراقبين" data={extraStats.topSupervisors || []} columns={[{ key: 'full_name', label: 'المراقب' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      </div>

      <RankingTable title="أعلى رؤساء مجموعات" data={extraStats.topLeaders || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
    </div>
  );
}

function DevManagerDashboard({ stats, extraStats }: { stats: DashboardStats, extraStats: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي النظام - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي النظام - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="إجمالي الإنتاج" value={formatCurrency(stats.totalProduction)} icon={TrendingUp} color="green" />
        <StatCard title="عدد الوثائق" value={formatNumber(stats.policyCount)} icon={FileText} color="indigo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable title="أعلى 5 وكلاء" data={extraStats.topAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
        <RankingTable title="أعلى رؤساء مجموعات" data={extraStats.topLeaders || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingTable title="أعلى المراقبين" data={extraStats.topSupervisors || []} columns={[{ key: 'full_name', label: 'المراقب' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
        <RankingTable title="أعلى المشرفين" data={extraStats.topGenSupervisors || []} columns={[{ key: 'full_name', label: 'المشرف العام' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      </div>

      <RankingTable title="مقارنة الفروع" data={extraStats.branchComparison || []} columns={[{ key: 'name', label: 'الفرع' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }, { key: 'collections', label: 'التحصيل', format: formatCurrency }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
    </div>
  );
}

function SuperAdminDashboard({ stats, extraStats }: { stats: DashboardStats, extraStats: any }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي النظام - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي النظام - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="إجمالي الإنتاج" value={formatCurrency(stats.totalProduction)} icon={TrendingUp} color="green" />
        <StatCard title="عدد الوثائق" value={formatNumber(stats.policyCount)} icon={FileText} color="indigo" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">الإحصائيات العامة</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm"><span className="text-slate-500">إجمالي العملاء</span><span className="font-bold">{formatNumber(stats.clientCount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">إجمالي الوثائق النشطة</span><span className="font-bold">{formatNumber(stats.activePolicyCount)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">إجمالي الإنتاج</span><span className="font-bold">{formatCurrency(stats.totalProduction)}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">ملخص الأداء</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm"><span className="text-slate-500">الإنتاج الجديد (السنة 1)</span><span className="font-bold">{formatCurrency(stats.totalNewBusiness)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">التحصيلات (السنة 1)</span><span className="font-bold">{formatCurrency(stats.totalFirstYearCollections)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-500">معدل التحصيل</span><span className="font-bold">{formatPercent(stats.collectionRate)}</span></div>
          </div>
        </div>
      </div>
      
      <RankingTable title="مقارنة الفروع" data={extraStats.branchComparison || []} columns={[{ key: 'name', label: 'الفرع' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }, { key: 'collections', label: 'التحصيل', format: formatCurrency }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
    </div>
  );
}
