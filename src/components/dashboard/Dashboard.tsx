import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatCurrency, formatPercent,
} from '../../lib/utils';

import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  LayoutDashboard, TrendingUp, Award, RefreshCw, Wallet, 
  Users, Building2, BarChart3, PieChart, ArrowUpRight, ArrowDownRight,
  ChevronLeft, Target, ShieldCheck, FileText
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

      let policiesQuery = supabase.from('policies').select('id, status', { count: 'exact' });
      let clientsQuery = supabase.from('clients').select('id', { count: 'exact' });
      let unifiedMetricsQuery = supabase.from('unified_performance_metrics').select('*').eq('is_first_year_collection', true);
      let targetsQuery = supabase.from('targets').select('target_amount').eq('period_type', 'monthly').eq('year', now_date.getFullYear()).eq('period_number', now_date.getMonth() + 1);

      if (branchId && branchId !== 'all' && userRole !== 'super_admin' && userRole !== 'dev_manager') {
        policiesQuery = policiesQuery.eq('branch_id', branchId);
        clientsQuery = clientsQuery.eq('branch_id', branchId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('branch_id', branchId);
        if (userRole !== 'agent' && !['team_leader', 'supervisor', 'general_supervisor'].includes(userRole)) {
          targetsQuery = targetsQuery.eq('branch_id', branchId);
        }
      }

      if (userRole === 'agent') {
        policiesQuery = policiesQuery.eq('agent_id', userId);
        clientsQuery = clientsQuery.eq('agent_id', userId);
        unifiedMetricsQuery = unifiedMetricsQuery.eq('agent_id', userId);
        targetsQuery = targetsQuery.eq('user_id', userId);
      } else if (['team_leader', 'supervisor', 'general_supervisor'].includes(userRole)) {
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
      const { data: subordinates } = await supabase
        .from('profiles')
        .select('id, full_name, role, manager_id, branch_id');

      if (!subordinates) return;

      let mySubordinates = [];
      if (role === 'team_leader') {
        mySubordinates = subordinates.filter(s => s.manager_id === userId);
      } else if (role === 'supervisor') {
        const teamLeaders = subordinates.filter(s => s.manager_id === userId);
        const agents = subordinates.filter(s => teamLeaders.some(tl => tl.id === s.manager_id));
        mySubordinates = [...teamLeaders, ...agents];
      } else if (role === 'general_supervisor') {
        mySubordinates = subordinates.filter(s => s.branch_id === branchId);
      } else {
        mySubordinates = subordinates;
      }

      const { data: allMetrics } = await supabase
        .from('unified_performance_metrics')
        .select('*')
        .eq('is_first_year_collection', true)
        .gte('collection_date', monthStart)
        .lte('collection_date', monthEnd);

      const metrics = allMetrics || [];

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
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <PageHeader
        title="لوحة التحكم الرئيسية"
        subtitle="Sales & Collection Management System"
        icon={LayoutDashboard}
        actions={
          <button 
            onClick={() => fetchStats()} 
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm font-bold text-sm text-slate-700 dark:text-slate-300 group"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
            تحديث البيانات
          </button>
        }
      />

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="الهدف الشهري" 
          value={formatCurrency(stats.monthlyTarget)} 
          icon={Target} 
          color="primary"
          subtitle="المستهدف لهذا الشهر"
        />
        <StatCard 
          title="المحقق الفعلي" 
          value={formatCurrency(stats.monthlyTotal)} 
          icon={TrendingUp} 
          color="success"
          trend={stats.targetAchievement}
          trendLabel="نسبة الإنجاز"
        />
        <StatCard 
          title="إجمالي الجديد" 
          value={formatCurrency(stats.monthlyNewBusiness)} 
          icon={Award} 
          color="warning"
          subtitle="إنتاج الشهر الحالي"
        />
        <StatCard 
          title="إجمالي التحصيل" 
          value={formatCurrency(stats.monthlyFirstYearCollections)} 
          icon={Wallet} 
          color="secondary"
          subtitle="تحصيل السنة الأولى"
        />
      </div>

      {/* Role-specific content */}
      <div className="space-y-8">
        {profile?.role === 'agent' && <AgentDashboard stats={stats} />}
        {profile?.role === 'team_leader' && <TeamLeaderDashboard stats={stats} subordinateStats={subordinateStats} />}
        {profile?.role === 'supervisor' && <SupervisorDashboard stats={stats} subordinateStats={subordinateStats} extraStats={extraStats} />}
        {profile?.role === 'general_supervisor' && <GeneralSupervisorDashboard stats={stats} subordinateStats={subordinateStats} extraStats={extraStats} />}
        {profile?.role === 'dev_manager' && <DevManagerDashboard stats={stats} extraStats={extraStats} />}
        {profile?.role === 'super_admin' && <SuperAdminDashboard stats={stats} extraStats={extraStats} />}
      </div>
    </div>
  );
}

// Visual Components
function StatCard({ title, value, icon: Icon, color, trend, trendLabel, subtitle }: any) {
  const colorStyles: any = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    secondary: 'bg-secondary/10 text-secondary border-secondary/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-crm hover:shadow-crm-lg transition-all duration-300 group">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3.5 rounded-2xl border ${colorStyles[color] || colorStyles.primary} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend !== undefined && (
          <div className="flex flex-col items-end">
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black ${trend >= 100 ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              {trend >= 100 ? <ArrowUpRight className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {formatPercent(trend)}
            </div>
            <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{trendLabel}</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-1">{title}</p>
        <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
        {subtitle && <p className="text-[11px] font-medium text-slate-400 mt-2">{subtitle}</p>}
      </div>
    </div>
  );
}

function RankingTable({ title, data, columns, icon: Icon = Award }: { title: string, data: any[], columns: { key: string, label: string, format?: any }[], icon?: any }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-crm overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
        <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-3">
          <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          {title}
        </h3>
        <button className="text-xs font-bold text-primary hover:underline">عرض الكل</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead>
            <tr className="bg-white dark:bg-slate-900">
              <th className="px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">#</th>
              {columns.map(col => (
                <th key={col.key} className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {data.map((item, idx) => (
              <tr key={item.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="px-8 py-4">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-black ${idx === 0 ? 'bg-warning/20 text-warning' : idx === 1 ? 'bg-slate-200 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                    {idx + 1}
                  </span>
                </td>
                {columns.map(col => (
                  <td key={col.key} className="px-6 py-4">
                    <span className={`text-sm ${col.key === 'total' || col.key === 'newBusiness' ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-600 dark:text-slate-400'}`}>
                      {col.format ? col.format(item[col.key]) : item[col.key]}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-8 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 opacity-30">
                    <BarChart3 className="w-12 h-12" />
                    <p className="text-sm font-bold">لا توجد بيانات متاحة حالياً</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Role Specific Dashboards
function AgentDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-primary/5 rounded-[2.5rem] p-8 border border-primary/10 relative overflow-hidden group">
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl group-hover:bg-primary/20 transition-all duration-500"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-primary text-white rounded-2xl shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-lg font-black text-primary">نظرة عامة على أدائك</h4>
              <p className="text-xs font-bold text-primary/60">تحليلات السنة التأمينية الأولى فقط</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur p-5 rounded-2xl border border-primary/5 shadow-sm">
              <p className="text-[11px] font-bold text-slate-400 mb-1">إجمالي الإنتاج</p>
              <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(stats.totalProduction)}</p>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur p-5 rounded-2xl border border-primary/5 shadow-sm">
              <p className="text-[11px] font-bold text-slate-400 mb-1">عدد الوثائق</p>
              <p className="text-xl font-black text-slate-900 dark:text-white">{stats.policyCount}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-slate-800 shadow-crm">
        <h4 className="text-base font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
          <div className="w-2 h-6 bg-primary rounded-full"></div>
          إحصائيات العملاء
        </h4>
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400">إجمالي العملاء</span>
            </div>
            <span className="text-lg font-black text-slate-900 dark:text-white">{stats.clientCount}</span>
          </div>
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
                <FileText className="w-5 h-5 text-secondary" />
              </div>
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400">الوثائق النشطة</span>
            </div>
            <span className="text-lg font-black text-slate-900 dark:text-white">{stats.policyCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamLeaderDashboard({ subordinateStats }: { stats: DashboardStats, subordinateStats: any[] }) {
  return (
    <RankingTable 
      title="ترتيب أداء الوكلاء (مجموعتك)" 
      data={subordinateStats} 
      columns={[
        { key: 'full_name', label: 'الوكيل' },
        { key: 'newBusiness', label: 'الجديد', format: formatCurrency },
        { key: 'collections', label: 'التحصيل', format: formatCurrency },
        { key: 'total', label: 'الإجمالي', format: formatCurrency }
      ]}
    />
  );
}

function SupervisorDashboard({ extraStats }: { stats: DashboardStats, subordinateStats: any[], extraStats: any }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <RankingTable title="أعلى الوكلاء إنتاجاً" data={extraStats.topAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
      <RankingTable title="أعلى المجموعات أداءً" data={extraStats.topGroups || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      <RankingTable title="أقل الوكلاء إنتاجاً" data={extraStats.bottomAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
      <RankingTable title="أقل المجموعات أداءً" data={extraStats.bottomGroups || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
    </div>
  );
}

function GeneralSupervisorDashboard({ extraStats }: { stats: DashboardStats, subordinateStats: any[], extraStats: any }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <RankingTable title="أعلى وكلاء الفرع" data={extraStats.topAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }]} />
      <RankingTable title="أداء المراقبين" data={extraStats.topSupervisors || []} columns={[{ key: 'full_name', label: 'المراقب' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      <RankingTable title="أداء رؤساء المجموعات" data={extraStats.topLeaders || []} columns={[{ key: 'full_name', label: 'رئيس المجموعة' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      <div className="bg-primary/5 rounded-[2.5rem] p-8 border border-primary/10 flex flex-col justify-center items-center text-center">
        <PieChart className="w-16 h-16 text-primary mb-4 opacity-20" />
        <h4 className="text-xl font-black text-primary mb-2">توزيع الإنتاج والتحصيل</h4>
        <p className="text-sm font-bold text-primary/60">سيتم إضافة الرسوم البيانية التفصيلية هنا قريباً</p>
      </div>
    </div>
  );
}

function DevManagerDashboard({ extraStats }: { stats: DashboardStats, extraStats: any }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <RankingTable title="مقارنة أداء الفروع" data={extraStats.branchComparison || []} columns={[{ key: 'name', label: 'الفرع' }, { key: 'newBusiness', label: 'الجديد', format: formatCurrency }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} icon={Building2} />
      <RankingTable title="أعلى المشرفين العامين" data={extraStats.topGenSupervisors || []} columns={[{ key: 'full_name', label: 'المشرف العام' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      <RankingTable title="أعلى المراقبين" data={extraStats.topSupervisors || []} columns={[{ key: 'full_name', label: 'المراقب' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
      <RankingTable title="أعلى الوكلاء" data={extraStats.topAgents || []} columns={[{ key: 'full_name', label: 'الوكيل' }, { key: 'total', label: 'الإجمالي', format: formatCurrency }]} />
    </div>
  );
}

function SuperAdminDashboard({ extraStats }: { stats: DashboardStats, extraStats: any }) {
  return <DevManagerDashboard stats={extraStats} extraStats={extraStats} />;
}
