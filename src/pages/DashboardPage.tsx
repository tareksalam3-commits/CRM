import { useEffect, useState } from 'react';
import { supabase, type Policy, type Installment } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import { fetchDashboardStats, type DashboardStats } from '../lib/stats';
import {
  FileText, Receipt, Users, TrendingUp, AlertCircle, Clock,
  Target, Award, ArrowUpRight, ChevronLeft,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import type { PageProps } from '../types';

const COLORS = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

export default function DashboardPage(_props: PageProps) {
  const { user } = useAuthContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPolicies, setRecentPolicies] = useState<Policy[]>([]);
  const [dueInstallments, setDueInstallments] = useState<Installment[]>([]);
  const [collectionsByMonth, setCollectionsByMonth] = useState<{ month: string; amount: number }[]>([]);
  const [policiesByType, setPoliciesByType] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchAllData();
  }, [user]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const statsData = await fetchDashboardStats(user!);
      setStats(statsData);

      // الوثائق الحديثة - مرشحة حسب الهرمية
      const { getAccessibleUserIds } = await import('../lib/permissions');
      const accessibleIds = await getAccessibleUserIds(user!);
      let recentPoliciesQuery = supabase
        .from('policies')
        .select('*, clients(full_name), policy_types(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      if (accessibleIds.length > 0) {
        recentPoliciesQuery = recentPoliciesQuery.in('agent_id', accessibleIds);
      }
      const { data: recentPoliciesData } = await recentPoliciesQuery;
      setRecentPolicies((recentPoliciesData as unknown as Policy[]) || []);

      // الأقساط المستحقة (الشهر الحالي فقط - السنة الأولى) - مرشحة حسب الهرمية
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      
      // الحصول على الوثائق المتاحة
      const { data: accessiblePolicies } = await supabase
        .from('policies')
        .select('id')
        .in('agent_id', accessibleIds);
      const policyIds = accessiblePolicies?.map(p => p.id) || [];
      
      let dueQuery = supabase
        .from('installments')
        .select('*, policies(policy_number, client_id, clients(full_name))')
        .eq('status', 'due')
        .eq('insurance_year', 1)
        .gte('due_date', startOfMonth)
        .lte('due_date', endOfMonth)
        .order('due_date', { ascending: true })
        .limit(5);
      if (policyIds.length > 0) {
        dueQuery = dueQuery.in('policy_id', policyIds);
      }
      const { data: dueData } = await dueQuery;
      
      const transformedDue = (dueData as any[])?.map(inst => ({
        ...inst,
        clients: inst.policies?.clients
      })) || [];
      setDueInstallments(transformedDue as unknown as Installment[]);

      // التحصيلات حسب الشهر (السنة الحالية - السنة الأولى فقط) - مرشحة حسب الهرمية
      const year = new Date().getFullYear();
      let collQuery = supabase
        .from('collections')
        .select('collection_date, amount')
        .gte('collection_date', `${year}-01-01`)
        .lte('collection_date', `${year}-12-31`);
      if (policyIds.length > 0) {
        collQuery = collQuery.in('policy_id', policyIds);
      }
      const { data: collData } = await collQuery;
      const monthMap = new Map<string, number>();
      collData?.forEach((c) => {
        const month = new Date(c.collection_date).toLocaleDateString('ar-EG', { month: 'short' });
        monthMap.set(month, (monthMap.get(month) || 0) + (c.amount || 0));
      });
      setCollectionsByMonth(Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount })));

      // الوثائق حسب النوع - مرشحة حسب الهرمية
      let typesQuery = supabase
        .from('policies')
        .select('policy_types(name)')
        .order('created_at', { ascending: false });
      if (accessibleIds.length > 0) {
        typesQuery = typesQuery.in('agent_id', accessibleIds);
      }
      const { data: typesData } = await typesQuery;
      const typeMap = new Map<string, number>();
      (typesData as any[])?.forEach((p) => {
        const type = p.policy_types?.name || 'غير محدد';
        typeMap.set(type, (typeMap.get(type) || 0) + 1);
      });
      setPoliciesByType(Array.from(typeMap.entries()).map(([name, count]) => ({ name, count })));

      setLoading(false);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto"></div>
          <p className="text-slate-600">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">لوحة التحكم</h2>
          <p className="page-subtitle">ملخص الأداء والإحصائيات للسنة الأولى</p>
        </div>
      </div>

      {/* Key Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">إجمالي الوثائق</span>
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{stats?.totalPolicies || 0}</p>
          <p className="text-xs text-slate-500">في السنة الأولى</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">إجمالي الأقساط المستحقة</span>
            <Clock className="w-5 h-5 text-yellow-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(stats?.totalDueAmount || 0)}</p>
          <p className="text-xs text-slate-500">{stats?.totalDueInstallments || 0} قسط</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">إجمالي المحصل</span>
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(stats?.totalCollectedAmount || 0)}</p>
          <p className="text-xs text-slate-500">من التحصيلات</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">نسبة التحصيل</span>
            <Award className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {stats && stats.totalDueAmount + stats.totalCollectedAmount > 0
              ? ((stats.totalCollectedAmount / (stats.totalDueAmount + stats.totalCollectedAmount)) * 100).toFixed(1)
              : '0'}%
          </p>
          <p className="text-xs text-slate-500">من إجمالي الأقساط</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Collections by Month */}
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-bold text-slate-900">التحصيلات حسب الشهر</h3>
          {collectionsByMonth.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={collectionsByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip 
                  formatter={(value) => formatCurrency(value as number)}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">
              لا توجد بيانات تحصيلات
            </div>
          )}
        </div>

        {/* Policies by Type */}
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-bold text-slate-900">الوثائق حسب النوع</h3>
          {policiesByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={policiesByType}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, count }) => `${name}: ${count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {policiesByType.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500">
              لا توجد بيانات وثائق
            </div>
          )}
        </div>
      </div>

      {/* Recent Data Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Policies */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">الوثائق الحديثة</h3>
            <ChevronLeft className="w-5 h-5 text-slate-400" />
          </div>
          <div className="space-y-3">
            {recentPolicies.length > 0 ? (
              recentPolicies.map((policy) => (
                <div key={policy.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-semibold text-slate-900">{policy.policy_number}</p>
                    <p className="text-xs text-slate-600">
                      {(policy as unknown as { clients?: { full_name: string } }).clients?.full_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{formatCurrency(policy.annual_premium)}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(policy.start_date).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                لا توجد وثائق حديثة
              </div>
            )}
          </div>
        </div>

        {/* Due Installments */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">الأقساط المستحقة</h3>
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="space-y-3">
            {dueInstallments.length > 0 ? (
              dueInstallments.map((installment) => (
                <div key={installment.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border-l-4 border-red-600">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {(installment as unknown as { policies?: { policy_number: string } }).policies?.policy_number}
                    </p>
                    <p className="text-xs text-slate-600">
                      {(installment as unknown as { clients?: { full_name: string } }).clients?.full_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{formatCurrency(installment.amount || 0)}</p>
                    <p className="text-xs text-red-600">
                      {new Date(installment.due_date).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-500">
                لا توجد أقساط مستحقة
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
