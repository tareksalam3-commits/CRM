import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, getMonthName } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import { BarChart3, Download, FileText, Printer } from 'lucide-react';

type ReportType = 'production' | 'collection' | 'overdue' | 'clients' | 'policies' | 'targets' | 'agents';

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('production');
  const [reportData, setReportData] = useState<any[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  async function generateReport() {
    setLoading(true);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    let data: any[] = [];

    switch (reportType) {
      case 'production': {
        const { data: policies } = await supabase
          .from('policies')
          .select('agent_id, annual_premium, profiles!policies_agent_id_fkey(full_name)')
          .gte('created_at', monthStart)
          .lt('created_at', monthEnd);
        const grouped: Record<string, { name: string; total: number; count: number }> = {};
        (policies || []).forEach((p: any) => {
          if (!grouped[p.agent_id]) grouped[p.agent_id] = { name: p.profiles?.full_name || '', total: 0, count: 0 };
          grouped[p.agent_id].total += Number(p.annual_premium);
          grouped[p.agent_id].count++;
        });
        data = Object.values(grouped).sort((a, b) => b.total - a.total);
        break;
      }
      case 'collection': {
        const { data: collections } = await supabase
          .from('collections')
          .select('collected_by, amount, profiles!collections_collected_by_fkey(full_name)')
          .gte('collection_date', monthStart)
          .lt('collection_date', monthEnd);
        const grouped: Record<string, { name: string; total: number; count: number }> = {};
        (collections || []).forEach((c: any) => {
          if (!grouped[c.collected_by]) grouped[c.collected_by] = { name: c.profiles?.full_name || '', total: 0, count: 0 };
          grouped[c.collected_by].total += Number(c.amount);
          grouped[c.collected_by].count++;
        });
        data = Object.values(grouped).sort((a, b) => b.total - a.total);
        break;
      }
      case 'overdue': {
        const { data: installments } = await supabase
          .from('installments')
          .select('amount, due_date, policy:policies(policy_number, client:clients(name), agent:profiles!policies_agent_id_fkey(full_name))')
          .eq('status', 'overdue')
          .order('due_date');
        data = (installments || []).map((i: any) => ({
          policy: i.policy?.policy_number,
          client: i.policy?.client?.name,
          agent: i.policy?.agent?.full_name,
          amount: Number(i.amount),
          due_date: i.due_date,
        }));
        break;
      }
      case 'clients': {
        const { data: clients } = await supabase
          .from('clients')
          .select('name, phone, agent:profiles!clients_agent_id_fkey(full_name), created_at')
          .gte('created_at', monthStart)
          .lt('created_at', monthEnd)
          .order('created_at', { ascending: false });
        data = clients || [];
        break;
      }
      case 'policies': {
        const { data: policies } = await supabase
          .from('policies')
          .select('policy_number, product, annual_premium, status, client:clients(name), agent:profiles!policies_agent_id_fkey(full_name)')
          .gte('created_at', monthStart)
          .lt('created_at', monthEnd);
        data = policies || [];
        break;
      }
      default:
        data = [];
    }

    setReportData(data);
    setLoading(false);
  }

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${reportType}_${year}_${month}.xlsx`);
  }

  function printReport() {
    window.print();
  }

  const reportTypes: { key: ReportType; label: string }[] = [
    { key: 'production', label: 'تقرير الإنتاج' },
    { key: 'collection', label: 'تقرير التحصيل' },
    { key: 'overdue', label: 'تقرير المتأخرات' },
    { key: 'clients', label: 'تقرير العملاء' },
    { key: 'policies', label: 'تقرير الوثائق' },
  ];

  return (
    <div>
      <PageHeader title="التقارير" description="إنشاء وتصدير التقارير" icon={BarChart3} />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">نوع التقرير</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              {reportTypes.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الشهر</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={generateReport} disabled={loading} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors">
              {loading ? 'جاري التحميل...' : 'إنشاء التقرير'}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {reportData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          {/* Export Actions */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">{reportData.length} نتيجة</p>
            <div className="flex gap-2">
              <button onClick={exportExcel} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                <Download className="w-3.5 h-3.5" /> Excel
              </button>
              <button onClick={printReport} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <Printer className="w-3.5 h-3.5" /> طباعة
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {Object.keys(reportData[0] || {}).map(key => (
                    <th key={key} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {reportData.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {Object.values(row).map((val: any, i) => (
                      <td key={i} className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {typeof val === 'number' ? formatCurrency(val) : typeof val === 'object' ? JSON.stringify(val) : String(val || '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reportData.length === 0 && !loading && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">اختر نوع التقرير واضغط "إنشاء التقرير"</p>
        </div>
      )}
    </div>
  );
}
