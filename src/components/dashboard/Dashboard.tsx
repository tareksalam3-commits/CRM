import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatCurrency, formatPercent, formatNumber,
} from '../../lib/utils';
import { POLICY_STATUS_LABELS } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  LayoutDashboard, Users, FileText, Wallet, TrendingUp,
  UserCircle, Award, RefreshCw, AlertCircle,
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
      // Ensure we only get first-year collections

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
        activePolicyCount: 0, // Simplified for brevity
        collectionRate: 0, // Simplified
        targetAchievement: monthlyTarget > 0 ? (monthlyNewBusiness / monthlyTarget) * 100 : 0,
        monthlyNewBusiness,
        monthlyFirstYearCollections,
        monthlyTotal: monthlyNewBusiness + monthlyFirstYearCollections,
        monthlyTarget
      });

    } catch (err: any) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranch, profile]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="لوحة التحكم (السنة الأولى فقط)"
        icon={LayoutDashboard}
        description={`مرحباً ${profile?.full_name} | ${profile?.role}`}
        actions={
          <button onClick={() => fetchStats()} className="p-2.5 bg-white border border-slate-200 rounded-xl">
            <RefreshCw className="w-5 h-5" />
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إنتاج جديد (الشهر)" value={formatCurrency(stats.monthlyNewBusiness)} icon={Award} color="blue" trend={stats.targetAchievement} trendLabel="من المستهدف" />
        <StatCard title="تحصيل (الشهر)" value={formatCurrency(stats.monthlyFirstYearCollections)} icon={Wallet} color="emerald" />
        <StatCard title="إجمالي الوثائق" value={formatNumber(stats.policyCount)} icon={FileText} color="indigo" />
        <StatCard title="إجمالي العملاء" value={formatNumber(stats.clientCount)} icon={UserCircle} color="violet" />
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold mb-6">ملخص أداء السنة الأولى</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي الإنتاج الجديد</span>
              <span className="font-bold">{formatCurrency(stats.totalNewBusiness)}</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full" style={{ width: '100%' }}></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">إجمالي التحصيلات (سنة 1)</span>
              <span className="font-bold">{formatCurrency(stats.totalFirstYearCollections)}</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: '100%' }}></div>
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
