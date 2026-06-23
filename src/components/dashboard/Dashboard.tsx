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
  Award, RefreshCw,
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

      if (branchId && branchId !== 'all' && userRole !== 'super_admin') {
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
      if (['supervisor', 'team_leader', 'general_supervisor', 'dev_manager'].includes(userRole)) {
        await fetchSubordinateStats(userId, userRole, monthStart, monthEnd);
      }

    } catch (err: any) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranch, profile]);

  const fetchSubordinateStats = async (userId: string, role: string, monthStart: string, monthEnd: string) => {
    try {
      // Get subordinates
      const { data: subordinates } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('manager_id', userId);

      if (!subordinates || subordinates.length === 0) {
        setSubordinateStats([]);
        return;
      }

      const stats = [];
      for (const sub of subordinates) {
        const { data: metrics } = await supabase
          .from('unified_performance_metrics')
          .select('amount, is_new_business, collection_date')
          .eq('agent_id', sub.id)
          .eq('is_first_year_collection', true);

        const monthlyMetrics = (metrics || []).filter(m => m.collection_date >= monthStart && m.collection_date <= monthEnd);
        const newBiz = monthlyMetrics.filter(m => m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);
        const collections = monthlyMetrics.filter(m => !m.is_new_business).reduce((s, m) => s + Number(m.amount), 0);

        stats.push({
          id: sub.id,
          name: sub.full_name,
          role: sub.role,
          newBusiness: newBiz,
          collections,
          total: newBiz + collections,
        });
      }

      setSubordinateStats(stats.sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error('Error fetching subordinate stats:', err);
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

      {/* Agent Dashboard */}
      {profile?.role === 'agent' && <AgentDashboard stats={stats} />}

      {/* Team Leader Dashboard */}
      {profile?.role === 'team_leader' && <TeamLeaderDashboard stats={stats} subordinateStats={subordinateStats} />}

      {/* Supervisor Dashboard */}
      {profile?.role === 'supervisor' && <SupervisorDashboard stats={stats} subordinateStats={subordinateStats} />}

      {/* General Supervisor Dashboard */}
      {profile?.role === 'general_supervisor' && <GeneralSupervisorDashboard stats={stats} subordinateStats={subordinateStats} />}

      {/* Dev Manager Dashboard */}
      {profile?.role === 'dev_manager' && <DevManagerDashboard stats={stats} />}

      {/* Super Admin Dashboard */}
      {profile?.role === 'super_admin' && <SuperAdminDashboard stats={stats} />}
    </div>
  );
}

// Agent Dashboard
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
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي الإنتاج الجديد</span>
              <span className="font-bold">{formatCurrency(stats.totalNewBusiness)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي التحصيلات (سنة 1)</span>
              <span className="font-bold">{formatCurrency(stats.totalFirstYearCollections)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي الإنتاج</span>
              <span className="font-bold">{formatCurrency(stats.totalProduction)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">الإحصائيات</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">عدد الوثائق</span>
              <span className="font-bold">{formatNumber(stats.policyCount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">عدد العملاء</span>
              <span className="font-bold">{formatNumber(stats.clientCount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">الأقساط المسددة</span>
              <span className="font-bold">{formatNumber(stats.policyCount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Team Leader Dashboard
function TeamLeaderDashboard({ stats, subordinateStats }: { stats: DashboardStats; subordinateStats: any[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي المجموعة - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي المجموعة - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="الهدف الشهري" value={formatCurrency(stats.monthlyTarget)} icon={Award} color="blue" />
        <StatCard title="نسبة الإنجاز" value={formatPercent(stats.targetAchievement)} icon={TrendingUp} color="green" />
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold mb-6">ترتيب الوكلاء في المجموعة</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">الترتيب</th>
                <th className="px-4 py-3 text-sm font-semibold">الوكيل</th>
                <th className="px-4 py-3 text-sm font-semibold">الجديد</th>
                <th className="px-4 py-3 text-sm font-semibold">التحصيل</th>
                <th className="px-4 py-3 text-sm font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {subordinateStats.map((agent, idx) => (
                <tr key={agent.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{agent.name}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(agent.newBusiness)}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(agent.collections)}</td>
                  <td className="px-4 py-3 text-sm font-bold">{formatCurrency(agent.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Supervisor Dashboard
function SupervisorDashboard({ stats, subordinateStats }: { stats: DashboardStats; subordinateStats: any[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي الإشراف - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي الإشراف - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="عدد رؤساء المجموعات" value={formatNumber(subordinateStats.length)} icon={Users} color="indigo" />
        <StatCard title="الإنتاج الإجمالي" value={formatCurrency(stats.totalProduction)} icon={TrendingUp} color="green" />
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold mb-6">ترتيب رؤساء المجموعات</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">الترتيب</th>
                <th className="px-4 py-3 text-sm font-semibold">رئيس المجموعة</th>
                <th className="px-4 py-3 text-sm font-semibold">الجديد</th>
                <th className="px-4 py-3 text-sm font-semibold">التحصيل</th>
                <th className="px-4 py-3 text-sm font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {subordinateStats.map((leader, idx) => (
                <tr key={leader.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{leader.name}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(leader.newBusiness)}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(leader.collections)}</td>
                  <td className="px-4 py-3 text-sm font-bold">{formatCurrency(leader.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// General Supervisor Dashboard
function GeneralSupervisorDashboard({ stats, subordinateStats }: { stats: DashboardStats; subordinateStats: any[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي الفرع - الجديد" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" />
        <StatCard title="إجمالي الفرع - التحصيل" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="عدد المراقبين" value={formatNumber(subordinateStats.length)} icon={Users} color="indigo" />
        <StatCard title="الإنتاج الإجمالي" value={formatCurrency(stats.totalProduction)} icon={TrendingUp} color="green" />
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold mb-6">ترتيب المراقبين</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold">الترتيب</th>
                <th className="px-4 py-3 text-sm font-semibold">المراقب</th>
                <th className="px-4 py-3 text-sm font-semibold">الجديد</th>
                <th className="px-4 py-3 text-sm font-semibold">التحصيل</th>
                <th className="px-4 py-3 text-sm font-semibold">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {subordinateStats.map((supervisor, idx) => (
                <tr key={supervisor.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{supervisor.name}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(supervisor.newBusiness)}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(supervisor.collections)}</td>
                  <td className="px-4 py-3 text-sm font-bold">{formatCurrency(supervisor.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Dev Manager Dashboard
function DevManagerDashboard({ stats }: { stats: DashboardStats }) {
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
          <h3 className="text-lg font-bold mb-6">مقارنة الفروع</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي الفروع</span>
              <span className="font-bold">تحت الإنشاء</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">مؤشرات النمو</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">معدل النمو</span>
              <span className="font-bold">تحت الإنشاء</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Super Admin Dashboard
function SuperAdminDashboard({ stats }: { stats: DashboardStats }) {
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
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي العملاء</span>
              <span className="font-bold">{formatNumber(stats.clientCount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي الوثائق النشطة</span>
              <span className="font-bold">{formatNumber(stats.activePolicyCount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي الإنتاج</span>
              <span className="font-bold">{formatCurrency(stats.totalProduction)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">ملخص الأداء</h3>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">الإنتاج الجديد (السنة 1)</span>
              <span className="font-bold">{formatCurrency(stats.totalNewBusiness)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">التحصيلات (السنة 1)</span>
              <span className="font-bold">{formatCurrency(stats.totalFirstYearCollections)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">معدل التحصيل</span>
              <span className="font-bold">{formatPercent(stats.collectionRate)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <div className={`p-3 rounded-2xl ${colors[color]}`}>
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
