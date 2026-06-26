import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import { Download, TrendingUp, Users, FileText, Receipt, Calendar, AlertCircle } from 'lucide-react';
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
      const startOfYear = `${year}-01-01`;
      const endOfYear = `${year}-12-31`;

      const { count: policiesCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfYear)
        .lte('created_at', endOfYear);

      const { count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      const { data: collectionsData } = await supabase
        .from('collections')
        .select('amount')
        .gte('collection_date', startOfYear)
        .lte('collection_date', endOfYear);

      const { data: dueData } = await supabase
        .from('installments')
        .select('amount')
        .eq('status', 'due');

      const { data: overdueData } = await supabase
        .from('installments')
        .select('amount')
        .eq('status', 'overdue');

      const { data: policiesByTypeData } = await supabase
        .from('policies')
        .select('policy_type_id, policy_types(name)');

      const { data: collectionsByMonthData } = await supabase
        .from('collections')
        .select('collection_date, amount')
        .gte('collection_date', startOfYear)
        .lte('collection_date', endOfYear);

      const { data: agentPerfData } = await supabase
        .from('policies')
        .select('agent_id, users!policies_agent_id_fkey(full_name), sum_insured');

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

      // Get collections per agent
      const { data: agentCollections } = await supabase
        .from('collections')
        .select('agent_id, amount, users!collections_agent_id_fkey(full_name)')
        .gte('collection_date', startOfYear)
        .lte('collection_date', endOfYear);

      (agentCollections as unknown as { users?: { full_name: string }; amount: number }[])?.forEach((c) => {
        const name = c.users?.full_name || 'غير محدد';
        const existing = agentMap.get(name) || { name, policies: 0, collections: 0 };
        existing.collections += (c.amount || 0);
        agentMap.set(name, existing);
      });

      setReportData({
        totalPolicies: policiesCount || 0,
        totalClients: clientsCount || 0,
        totalCollections: totalCollections,
        totalDueAmount: totalDue,
        totalOverdueAmount: totalOverdue,
        policiesByType: Array.from(typeMap.entries()).map(([name, count]) => ({ name, count })),
        collectionsByMonth: Array.from(monthMap.entries()).map(([month, amount]) => ({ month, amount })),
        agentPerformance: Array.from(agentMap.values()),
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'حدث خطأ في تحميل التقرير');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!reportData) return;
    const rows = [
      ['التقرير السنوي', year.toString()],
      ['إجمالي الوثائق', reportData.totalPolicies.toString()],
      ['إجمالي العملاء', reportData.totalClients.toString()],
      ['إجمالي التحصيل', reportData.totalCollections.toString()],
      ['إجمالي المستحق', reportData.totalDueAmount.toString()],
      ['إجمالي المتأخر', reportData.totalOverdueAmount.toString()],
      [],
      ['الوثائق حسب النوع'],
      ['النوع', 'العدد'],
      ...reportData.policiesByType.map((t) => [t.name, t.count.toString()]),
      [],
      ['التحصيل الشهري'],
      ['الشهر', 'المبلغ'],
      ...reportData.collectionsByMonth.map((m) => [m.month, m.amount.toString()]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `report_${year}.csv`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="page-title">التقارير</h2>
          <p className="page-subtitle">تقارير وإحصائيات النظام</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="input-field pr-11 w-full sm:w-auto"
            >
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button onClick={exportCSV} className="btn-secondary">
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">تصدير</span>
          </button>
        </div>
      </div>

      {reportData && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">إجمالي الوثائق</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{reportData.totalPolicies}</p>
                </div>
                <div className="stat-icon bg-sky-50 text-sky-700">
                  <FileText className="w-6 h-6" />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">إجمالي العملاء</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{reportData.totalClients}</p>
                </div>
                <div className="stat-icon bg-emerald-50 text-emerald-700">
                  <Users className="w-6 h-6" />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">إجمالي التحصيل</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{reportData.totalCollections.toLocaleString()}</p>
                </div>
                <div className="stat-icon bg-emerald-50 text-emerald-700">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">المستحق</p>
                  <p className="text-xl sm:text-2xl font-bold text-slate-900">{reportData.totalDueAmount.toLocaleString()}</p>
                </div>
                <div className="stat-icon bg-amber-50 text-amber-700">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Overdue Alert */}
          {reportData.totalOverdueAmount > 0 && (
            <div className="card bg-red-50 border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <p className="font-bold text-red-900">إجمالي المتأخرات</p>
                  <p className="text-lg font-bold text-red-700">{reportData.totalOverdueAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Policies by Type */}
            <div className="card">
              <h3 className="section-title">الوثائق حسب النوع</h3>
              {reportData.policiesByType.length === 0 ? (
                <div className="empty-state py-8">
                  <FileText className="empty-state-icon" />
                  <p>لا توجد بيانات</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reportData.policiesByType.map((type) => {
                    const maxCount = Math.max(...reportData.policiesByType.map((t) => t.count));
                    const pct = maxCount > 0 ? (type.count / maxCount) * 100 : 0;
                    return (
                      <div key={type.name} className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 w-24 sm:w-32 truncate">{type.name}</span>
                        <div className="flex-1 h-5 sm:h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-slate-900 w-8 text-left">{type.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Collections by Month */}
            <div className="card">
              <h3 className="section-title">التحصيل الشهري</h3>
              {reportData.collectionsByMonth.length === 0 ? (
                <div className="empty-state py-8">
                  <Receipt className="empty-state-icon" />
                  <p>لا توجد بيانات</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reportData.collectionsByMonth.map((month) => {
                    const maxAmount = Math.max(...reportData.collectionsByMonth.map((m) => m.amount));
                    const pct = maxAmount > 0 ? (month.amount / maxAmount) * 100 : 0;
                    return (
                      <div key={month.month} className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 w-16 sm:w-20">{month.month}</span>
                        <div className="flex-1 h-5 sm:h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-slate-900 w-16 text-left">{month.amount.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Agent Performance */}
          <div className="card">
            <h3 className="section-title">أداء الوكلاء</h3>
            {reportData.agentPerformance.length === 0 ? (
              <div className="empty-state py-8">
                <Users className="empty-state-icon" />
                <p>لا توجد بيانات</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-header">الوكيل</th>
                      <th className="table-header">عدد الوثائق</th>
                      <th className="table-header">إجمالي التحصيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.agentPerformance.map((agent) => (
                      <tr key={agent.name} className="hover:bg-slate-50 transition-colors">
                        <td className="table-cell font-medium">{agent.name}</td>
                        <td className="table-cell">
                          <span className="badge badge-info">{agent.policies}</span>
                        </td>
                        <td className="table-cell font-bold">{agent.collections.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
