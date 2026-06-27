import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import { Download, TrendingUp, Users, FileText, Receipt, Calendar, AlertCircle, BarChart3 } from 'lucide-react';
import type { PageProps } from '../types';

interface ReportData {
  totalPolicies: number;
  totalClients: number;
  totalCollections: number;
  totalDueAmount: number;
  totalOverdueAmount: number;
  policiesByType: { name: string; count: number }[];
  collectionsByMonth: { month: string; amount: number }[];
  agentPerformance: { name: string; policies: number; collections: number }[];
}

export default function ReportsPage({ showError }: PageProps) {
  const { user } = useAuthContext();
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (user) fetchReportData();
  }, [user, year]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const { getAccessibleUserIds } = await import('../lib/permissions');
      const accessibleIds = await getAccessibleUserIds(user!);

      const startOfYear = `${year}-01-01`;
      const endOfYear = `${year}-12-31`;

      // الحصول على الوثائق المتاحة
      let policiesQuery = supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfYear)
        .lte('created_at', endOfYear);
      if (accessibleIds.length > 0) {
        policiesQuery = policiesQuery.in('agent_id', accessibleIds);
      }
      const { count: policiesCount } = await policiesQuery;

      // الحصول على العملاء المتاحين
      let clientsQuery = supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });
      if (accessibleIds.length > 0) {
        clientsQuery = clientsQuery.in('agent_id', accessibleIds);
      }
      const { count: clientsCount } = await clientsQuery;

      // الحصول على الوثائق المتاحة للاستعلام عن الأقساط
      const { data: accessiblePolicies } = await supabase
        .from('policies')
        .select('id')
        .in('agent_id', accessibleIds);
      const policyIds = accessiblePolicies?.map(p => p.id) || [];

      // التحصيلات في السنة الأولى فقط
      let collectionsQuery = supabase
        .from('collections')
        .select('amount')
        .gte('collection_date', startOfYear)
        .lte('collection_date', endOfYear);
      if (policyIds.length > 0) {
        collectionsQuery = collectionsQuery.in('policy_id', policyIds);
      }
      const { data: collectionsData } = await collectionsQuery;

      // الأقساط المستحقة (السنة الأولى فقط)
      let dueQuery = supabase
        .from('installments')
        .select('amount')
        .eq('status', 'due')
        .eq('insurance_year', 1);
      if (policyIds.length > 0) {
        dueQuery = dueQuery.in('policy_id', policyIds);
      }
      const { data: dueData } = await dueQuery;

      // الأقساط المتأخرة (الشهر السابق فقط - السنة الأولى)
      const now = new Date();
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      
      let overdueQuery = supabase
        .from('installments')
        .select('amount')
        .eq('status', 'due')
        .eq('insurance_year', 1)
        .gte('due_date', prevMonthStart)
        .lte('due_date', prevMonthEnd);
      if (policyIds.length > 0) {
        overdueQuery = overdueQuery.in('policy_id', policyIds);
      }
      const { data: overdueData } = await overdueQuery;

      // الوثائق حسب النوع
      let policiesByTypeQuery = supabase
        .from('policies')
        .select('policy_type_id, policy_types(name)');
      if (accessibleIds.length > 0) {
        policiesByTypeQuery = policiesByTypeQuery.in('agent_id', accessibleIds);
      }
      const { data: policiesByTypeData } = await policiesByTypeQuery;

      // التحصيلات حسب الشهر
      let collectionsByMonthQuery = supabase
        .from('collections')
        .select('collection_date, amount')
        .gte('collection_date', startOfYear)
        .lte('collection_date', endOfYear);
      if (policyIds.length > 0) {
        collectionsByMonthQuery = collectionsByMonthQuery.in('policy_id', policyIds);
      }
      const { data: collectionsByMonthData } = await collectionsByMonthQuery;

      // أداء الوكلاء
      let agentPerfQuery = supabase
        .from('policies')
        .select('agent_id, users!policies_agent_id_fkey(full_name), sum_insured');
      if (accessibleIds.length > 0) {
        agentPerfQuery = agentPerfQuery.in('agent_id', accessibleIds);
      }
      const { data: agentPerfData } = await agentPerfQuery;

      const totalCollections = collectionsData?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;
      const totalDue = dueData?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
      const totalOverdue = overdueData?.reduce((sum, o) => sum + (o.amount || 0), 0) || 0;

      const typeMap = new Map<string, number>();
      (policiesByTypeData as unknown as { policy_types?: { name: string } }[])?.forEach((p) => {
        const name = p.policy_types?.name || 'غير محدد';
        typeMap.set(name, (typeMap.get(name) || 0) + 1);
      });

      const monthMap = new Map<string, number>();
      collectionsByMonthData?.forEach((c) => {
        const month = new Date(c.collection_date).toLocaleDateString('ar-EG', { month: 'short' });
        monthMap.set(month, (monthMap.get(month) || 0) + (c.amount || 0));
      });

      const agentMap = new Map<string, { name: string; policies: number; collections: number }>();
      (agentPerfData as unknown as { users?: { full_name: string } }[])?.forEach((p) => {
        const name = p.users?.full_name || 'غير محدد';
        const existing = agentMap.get(name) || { name, policies: 0, collections: 0 };
        existing.policies += 1;
        agentMap.set(name, existing);
      });

      // الحصول على التحصيلات لكل وكيل
      let agentCollectionsQuery = supabase
        .from('collections')
        .select('policies(agent_id, users!policies_agent_id_fkey(full_name)), amount')
        .gte('collection_date', startOfYear)
        .lte('collection_date', endOfYear);
      if (policyIds.length > 0) {
        agentCollectionsQuery = agentCollectionsQuery.in('policy_id', policyIds);
      }
      const { data: agentCollections } = await agentCollectionsQuery;

      agentCollections?.forEach((c: any) => {
        const name = c.policies?.users?.full_name || 'غير محدد';
        const existing = agentMap.get(name) || { name, policies: 0, collections: 0 };
        existing.collections += c.amount || 0;
        agentMap.set(name, existing);
      });

      setReportData({
        totalPolicies: policiesCount || 0,
        totalClients: clientsCount || 0,
        totalCollections,
        totalDueAmount: totalDue,
        totalOverdueAmount: totalOverdue,
        policiesByType: Array.from(typeMap.entries()).map(([name, count]) => ({ name, count })),
        collectionsByMonth: Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount })),
        agentPerformance: Array.from(agentMap.values()),
      });

      setLoading(false);
    } catch (err) {
      console.error('Error fetching report data:', err);
      showError('خطأ في جلب بيانات التقرير');
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP'
    }).format(amount);
  };

  const downloadReport = () => {
    if (!reportData) return;

    const reportContent = `
تقرير الأداء - السنة الأولى
التاريخ: ${new Date().toLocaleDateString('ar-EG')}

=== ملخص الإحصائيات ===
إجمالي الوثائق: ${reportData.totalPolicies}
إجمالي العملاء: ${reportData.totalClients}
إجمالي المحصل: ${formatCurrency(reportData.totalCollections)}
إجمالي الأقساط المستحقة: ${formatCurrency(reportData.totalDueAmount)}
إجمالي الأقساط المتأخرة: ${formatCurrency(reportData.totalOverdueAmount)}

=== الوثائق حسب النوع ===
${reportData.policiesByType.map(p => `${p.name}: ${p.count}`).join('\n')}

=== التحصيلات حسب الشهر ===
${reportData.collectionsByMonth.map(c => `${c.month}: ${formatCurrency(c.amount)}`).join('\n')}

=== أداء الوكلاء ===
${reportData.agentPerformance.map(a => `${a.name}: ${a.policies} وثيقة، ${formatCurrency(a.collections)} محصل`).join('\n')}
    `;

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(reportContent));
    element.setAttribute('download', `report-${year}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto"></div>
          <p className="text-slate-600">جاري تحميل التقرير...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">التقارير</h2>
          <p className="page-subtitle">تقارير الأداء والإحصائيات للسنة الأولى</p>
        </div>
        <button onClick={downloadReport} className="btn-primary">
          <Download className="w-5 h-5" />
          <span className="hidden sm:inline">تحميل التقرير</span>
        </button>
      </div>

      {/* Year Filter */}
      <div className="card p-4">
        <label className="label">السنة</label>
        <select 
          value={year} 
          onChange={(e) => setYear(Number(e.target.value))}
          className="input-field"
        >
          {[2024, 2025, 2026, 2027].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">إجمالي الوثائق</span>
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{reportData?.totalPolicies || 0}</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">إجمالي العملاء</span>
            <Users className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{reportData?.totalClients || 0}</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">إجمالي المحصل</span>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(reportData?.totalCollections || 0)}</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">الأقساط المستحقة</span>
            <Receipt className="w-5 h-5 text-yellow-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(reportData?.totalDueAmount || 0)}</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">الأقساط المتأخرة</span>
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{formatCurrency(reportData?.totalOverdueAmount || 0)}</p>
        </div>

        <div className="card p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">نسبة التحصيل</span>
            <BarChart3 className="w-5 h-5 text-indigo-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {reportData && reportData.totalDueAmount + reportData.totalCollections > 0
              ? ((reportData.totalCollections / (reportData.totalDueAmount + reportData.totalCollections)) * 100).toFixed(1)
              : '0'}%
          </p>
        </div>
      </div>

      {/* Detailed Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policies by Type */}
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-bold text-slate-900">الوثائق حسب النوع</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-4 font-semibold text-slate-900">النوع</th>
                  <th className="text-right py-2 px-4 font-semibold text-slate-900">العدد</th>
                </tr>
              </thead>
              <tbody>
                {reportData?.policiesByType.map((type) => (
                  <tr key={type.name} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900">{type.name}</td>
                    <td className="py-3 px-4 text-slate-900 font-semibold">{type.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Collections by Month */}
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-bold text-slate-900">التحصيلات حسب الشهر</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="text-right py-2 px-4 font-semibold text-slate-900">الشهر</th>
                  <th className="text-right py-2 px-4 font-semibold text-slate-900">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {reportData?.collectionsByMonth.map((month) => (
                  <tr key={month.month} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-900">{month.month}</td>
                    <td className="py-3 px-4 text-slate-900 font-semibold">{formatCurrency(month.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Agent Performance */}
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">أداء الوكلاء</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="text-right py-2 px-4 font-semibold text-slate-900">اسم الوكيل</th>
                <th className="text-right py-2 px-4 font-semibold text-slate-900">عدد الوثائق</th>
                <th className="text-right py-2 px-4 font-semibold text-slate-900">إجمالي المحصل</th>
              </tr>
            </thead>
            <tbody>
              {reportData?.agentPerformance.map((agent) => (
                <tr key={agent.name} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-slate-900">{agent.name}</td>
                  <td className="py-3 px-4 text-slate-900 font-semibold">{agent.policies}</td>
                  <td className="py-3 px-4 text-slate-900 font-semibold">{formatCurrency(agent.collections)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
