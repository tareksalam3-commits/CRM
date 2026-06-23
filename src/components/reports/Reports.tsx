import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canViewAdminReports } from '../../lib/rbac';
import { Download, Filter, BarChart, PieChart, TrendingUp, DollarSign, Calendar, User, FileText, Loader2, Building2, Users, Wallet, CheckSquare } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel } from '../../lib/excel';
import toast from 'react-hot-toast';

type ReportType = 'production' | 'collection' | 'branch_performance' | 'agent_performance';

interface KPICard {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

export default function Reports() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('production');
  const [reportData, setReportData] = useState<any[]>([]);
  const [kpis, setKpis] = useState<KPICard[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [allProfiles, setAllProfiles] = useState<any[]>([]);

  const canViewAdmin = profile?.role ? canViewAdminReports(profile.role as any) : false;

  const getSubordinateIds = (userId: string, profiles: any[]): string[] => {
    const directReports = profiles.filter(p => p.manager_id === userId).map(p => p.id);
    const allIds: string[] = [...directReports];
    for (const id of directReports) {
      allIds.push(...getSubordinateIds(id, profiles));
    }
    return allIds;
  };

  const generateReport = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setReportData([]);
    setKpis([]);

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const nxtM = month === 12 ? 1 : month + 1;
    const nxtY = month === 12 ? year + 1 : year;
    const monthEnd = `${nxtY}-${String(nxtM).padStart(2, '0')}-01`;

    try {
      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, manager_id');
      const profiles = profilesData || [];
      setAllProfiles(profiles);

      let data: Record<string, unknown>[] = [];
      const newKpis: KPICard[] = [];

      switch (reportType) {
        case 'production': {
          // Fetch only first-year metrics
          let query = supabase
            .from('unified_performance_metrics')
            .select('agent_id, amount, is_new_business, is_first_year_collection, collection_date')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true);

          const { data: metrics, error: metricsError } = await query;
          if (metricsError) {
            console.error('Error fetching metrics:', metricsError);
          } else if (metrics) {
            const total = metrics.reduce((sum, m) => sum + (m.amount as number), 0);
            const newBiz = metrics.filter(m => m.is_new_business).reduce((sum, m) => sum + (m.amount as number), 0);
            const collections = metrics.filter(m => !m.is_new_business).reduce((sum, m) => sum + (m.amount as number), 0);
            
            newKpis.push(
              { label: 'إجمالي الإنتاج (السنة الأولى)', value: formatCurrency(total), icon: DollarSign, color: 'blue' },
              { label: 'الإنتاج الجديد', value: formatCurrency(newBiz), icon: TrendingUp, color: 'green' },
              { label: 'التحصيل (السنة الأولى)', value: formatCurrency(collections), icon: Wallet, color: 'emerald' }
            );
            data = metrics.map(m => ({
              'المندوب': m.agent_id,
              'المبلغ': m.amount,
              'نوع': m.is_new_business ? 'إنتاج جديد' : 'تحصيل',
              'التاريخ': m.collection_date
            }));
          }
          break;
        }

        case 'collection': {
          // Fetch first-year collections only
          let query = supabase
            .from('unified_performance_metrics')
            .select('amount, collection_date, agent_id')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true)
            .eq('is_new_business', false);

          const { data: collections, error: colError } = await query;
          if (colError) {
            console.error('Error fetching collections:', colError);
          } else if (collections) {
            const total = collections.reduce((sum, c) => sum + (c.amount as number), 0);
            
            newKpis.push(
              { label: 'إجمالي التحصيل (السنة الأولى)', value: formatCurrency(total), icon: Wallet, color: 'blue' },
              { label: 'عدد التحصيلات', value: collections.length.toString(), icon: CheckSquare, color: 'green' }
            );
            data = collections.map(c => ({
              'المندوب': c.agent_id,
              'المبلغ': c.amount,
              'التاريخ': c.collection_date
            }));
          }
          break;
        }

        case 'branch_performance': {
          if (!canViewAdmin) break;
          
          // Fetch branch performance from first-year metrics
          const { data: metrics } = await supabase
            .from('unified_performance_metrics')
            .select('branch_id, amount, is_new_business')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true);

          if (metrics) {
            const { data: branches } = await supabase.from('branches').select('id, name');
            const branchMap = new Map(branches?.map(b => [b.id, b.name]) || []);

            const branchData = new Map<string, any>();
            for (const m of metrics) {
              const bid = m.branch_id;
              if (!branchData.has(bid)) {
                branchData.set(bid, {
                  branch_id: bid,
                  branch_name: branchMap.get(bid) || 'Unknown',
                  new_business: 0,
                  collections: 0,
                  total_production: 0
                });
              }
              const bd = branchData.get(bid);
              if (m.is_new_business) {
                bd.new_business += m.amount;
              } else {
                bd.collections += m.amount;
              }
              bd.total_production += m.amount;
            }

            const total = Array.from(branchData.values()).reduce((sum, b) => sum + b.total_production, 0);
            newKpis.push({ label: 'إجمالي إنتاج الفروع (السنة الأولى)', value: formatCurrency(total), icon: Building2, color: 'blue' });
            data = Array.from(branchData.values());
          }
          break;
        }

        case 'agent_performance': {
          if (!canViewAdmin) break;
          
          // Fetch agent performance from first-year metrics
          const { data: metrics } = await supabase
            .from('unified_performance_metrics')
            .select('agent_id, amount, is_new_business')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true);

          if (metrics) {
            const { data: profiles } = await supabase.from('profiles').select('id, full_name');
            const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

            const agentData = new Map<string, any>();
            for (const m of metrics) {
              const aid = m.agent_id;
              if (!agentData.has(aid)) {
                agentData.set(aid, {
                  agent_id: aid,
                  agent_name: profileMap.get(aid) || 'Unknown',
                  new_business: 0,
                  collections: 0,
                  total_production: 0
                });
              }
              const ad = agentData.get(aid);
              if (m.is_new_business) {
                ad.new_business += m.amount;
              } else {
                ad.collections += m.amount;
              }
              ad.total_production += m.amount;
            }

            const total = Array.from(agentData.values()).reduce((sum, a) => sum + a.total_production, 0);
            newKpis.push({ label: 'إجمالي إنتاج الوكلاء (السنة الأولى)', value: formatCurrency(total), icon: Users, color: 'blue' });
            data = Array.from(agentData.values());
          }
          break;
        }
      }

      setKpis(newKpis);
      setReportData(data);
    } catch (err) {
      console.error('Report generation error:', err);
      toast.error('حدث خطأ أثناء إنشاء التقرير');
    } finally {
      setLoading(false);
    }
  }, [profile, reportType, month, year, canViewAdmin]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  const handleExport = () => {
    if (reportData.length === 0) return;
    try {
      exportToExcel(reportData, `${reportType}_report_${year}_${month}`);
      toast.success('تم تصدير التقرير بنجاح');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('حدث خطأ أثناء تصدير التقرير');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">التقارير (السنة الأولى فقط)</h1>
          <p className="text-slate-500 dark:text-slate-400">تحليل الأداء والإنتاج والتحصيل</p>
        </div>
        <button
          onClick={handleExport}
          disabled={reportData.length === 0 || loading}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>تصدير Excel</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 mr-1">نوع التقرير</label>
            <div className="relative">
              <FileText className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="production">الإنتاج (السنة الأولى)</option>
                <option value="collection">التحصيل (السنة الأولى)</option>
                {canViewAdmin && (
                  <>
                    <option value="branch_performance">أداء الفروع (السنة الأولى)</option>
                    <option value="agent_performance">أداء الوكلاء (السنة الأولى)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="w-32">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 mr-1">الشهر</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('ar-EG', { month: 'long' })}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-32">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 mr-1">السنة</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="self-end">
            <button
              onClick={generateReport}
              disabled={loading}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'تحديث'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi, index) => (
          <div key={index} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400`}>
                <kpi.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{kpi.label}</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{kpi.value}</h3>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white">تفاصيل البيانات</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-500 text-sm">جاري إنشاء التقرير...</p>
            </div>
          ) : reportData.length > 0 ? (
            <table className="w-full text-right">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  {Object.keys(reportData[0]).filter(k => typeof reportData[0][k] !== 'object').map(key => (
                    <th key={key} className="px-6 py-4">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {reportData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    {Object.keys(row).filter(k => typeof row[k] !== 'object').map(key => (
                      <td key={key} className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {typeof row[key] === 'number' && (key.includes('amount') || key.includes('production') || key.includes('collection') || key.includes('المبلغ')) ? formatCurrency(row[key]) : String(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <BarChart className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 text-sm">لا توجد بيانات لهذا التقرير في الفترة المختارة</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
