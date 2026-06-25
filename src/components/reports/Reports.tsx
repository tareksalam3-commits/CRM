import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canViewAdminReports } from '../../lib/rbac';
import { getBranchScope, getSubordinateIds } from '../../lib/dataAccess';
import { Download, Filter, BarChart, PieChart, TrendingUp, DollarSign, Calendar, User, FileText, Loader2, Building2, Users, Wallet, CheckSquare, Search, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import { exportToExcel } from '../../lib/excel';
import PageHeader from '../common/PageHeader';
import toast from 'react-hot-toast';

type ReportType = 'production' | 'collection' | 'branch_performance' | 'agent_performance';

interface KPICard {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

export default function Reports() {
  const { profile, activeBranch } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('production');
  const [reportData, setReportData] = useState<any[]>([]);
  const [kpis, setKpis] = useState<KPICard[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [allProfiles, setAllProfiles] = useState<any[]>([]);

  const canViewAdmin = profile?.role ? canViewAdminReports(profile.role as any) : false;

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
      const scope = getBranchScope(profile, activeBranch);
      let subIds: string[] = [];
      if (scope.role === 'team_leader' || scope.role === 'supervisor') {
        subIds = await getSubordinateIds(scope.userId);
      }

      const { data: profilesData } = await supabase.from('profiles').select('id, full_name, manager_id');
      const profiles = profilesData || [];
      setAllProfiles(profiles);

      let data: Record<string, unknown>[] = [];
      const newKpis: KPICard[] = [];

      const applyScope = (q: any) => {
        let query = q;
        if (!scope.isAllBranches && scope.branchId) {
          query = query.eq('branch_id', scope.branchId);
        }
        if (scope.role === 'agent') {
          query = query.eq('agent_id', scope.userId);
        } else if ((scope.role === 'team_leader' || scope.role === 'supervisor') && subIds.length > 0) {
          query = query.in('agent_id', subIds);
        }
        return query;
      };

      switch (reportType) {
        case 'production': {
          let query = applyScope(supabase
            .from('unified_performance_metrics')
            .select('agent_id, amount, is_new_business, is_first_year_collection, collection_date, policy:policies(policy_number, client:clients(name))')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true));

          const { data: metrics, error: metricsError } = await query;
          if (metricsError) {
            console.error('Error fetching metrics:', metricsError);
          } else if (metrics) {
            const total = metrics.reduce((sum, m) => sum + (m.amount as number), 0);
            const newBiz = metrics.filter(m => m.is_new_business).reduce((sum, m) => sum + (m.amount as number), 0);
            const collections = metrics.filter(m => !m.is_new_business).reduce((sum, m) => sum + (m.amount as number), 0);
            
            newKpis.push(
              { label: 'إجمالي الإنتاج (السنة الأولى)', value: formatCurrency(total), icon: DollarSign, color: 'primary' },
              { label: 'الإنتاج الجديد', value: formatCurrency(newBiz), icon: TrendingUp, color: 'success' },
              { label: 'التحصيل (السنة الأولى)', value: formatCurrency(collections), icon: Wallet, color: 'secondary' }
            );
            data = metrics.map(m => ({
              'العميل': (m.policy as any)?.client?.name || 'Unknown',
              'الوثيقة': (m.policy as any)?.policy_number || 'Unknown',
              'المندوب': profiles.find(p => p.id === m.agent_id)?.full_name || 'Unknown',
              'المبلغ': m.amount,
              'نوع': m.is_new_business ? 'إنتاج جديد' : 'تحصيل',
              'التاريخ': m.collection_date
            }));
          }
          break;
        }

        case 'collection': {
          let query = applyScope(supabase
            .from('unified_performance_metrics')
            .select('amount, collection_date, agent_id, policy:policies(policy_number, client:clients(name))')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true)
            .eq('is_new_business', false));

          const { data: collections, error: colError } = await query;
          if (colError) {
            console.error('Error fetching collections:', colError);
          } else if (collections) {
            const total = collections.reduce((sum, c) => sum + (c.amount as number), 0);
            
            newKpis.push(
              { label: 'إجمالي التحصيل (السنة الأولى)', value: formatCurrency(total), icon: Wallet, color: 'primary' },
              { label: 'عدد التحصيلات', value: collections.length.toString(), icon: CheckSquare, color: 'success' }
            );
            data = collections.map(c => ({
              'العميل': (c.policy as any)?.client?.name || 'Unknown',
              'الوثيقة': (c.policy as any)?.policy_number || 'Unknown',
              'المندوب': profiles.find(p => p.id === c.agent_id)?.full_name || 'Unknown',
              'المبلغ': c.amount,
              'التاريخ': c.collection_date
            }));
          }
          break;
        }

        case 'branch_performance': {
          if (!canViewAdmin) break;
          let query = applyScope(supabase
            .from('unified_performance_metrics')
            .select('branch_id, amount, is_new_business')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true));

          const { data: metrics } = await query;

          if (metrics) {
            const { data: branches } = await supabase.from('branches').select('id, name');
            const branchMap = new Map(branches?.map(b => [b.id, b.name]) || []);

            const branchData = new Map<string, any>();
            for (const m of metrics) {
              const bid = m.branch_id;
              if (!branchData.has(bid)) {
                branchData.set(bid, {
                  'الفرع': branchMap.get(bid) || 'Unknown',
                  'الإنتاج الجديد': 0,
                  'التحصيل': 0,
                  'الإجمالي': 0
                });
              }
              const bd = branchData.get(bid);
              if (m.is_new_business) {
                bd['الإنتاج الجديد'] += m.amount;
              } else {
                bd['التحصيل'] += m.amount;
              }
              bd['الإجمالي'] += m.amount;
            }

            const total = Array.from(branchData.values()).reduce((sum, b) => sum + b['الإجمالي'], 0);
            newKpis.push({ label: 'إجمالي إنتاج الفروع (السنة الأولى)', value: formatCurrency(total), icon: Building2, color: 'primary' });
            data = Array.from(branchData.values());
          }
          break;
        }

        case 'agent_performance': {
          if (!canViewAdmin) break;
          let query = applyScope(supabase
            .from('unified_performance_metrics')
            .select('agent_id, amount, is_new_business')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd)
            .eq('is_first_year_collection', true));

          const { data: metrics } = await query;

          if (metrics) {
            const { data: profiles } = await supabase.from('profiles').select('id, full_name');
            const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

            const agentData = new Map<string, any>();
            for (const m of metrics) {
              const aid = m.agent_id;
              if (!agentData.has(aid)) {
                agentData.set(aid, {
                  'الوكيل': profileMap.get(aid) || 'Unknown',
                  'الإنتاج الجديد': 0,
                  'التحصيل': 0,
                  'الإجمالي': 0
                });
              }
              const ad = agentData.get(aid);
              if (m.is_new_business) {
                ad['الإنتاج الجديد'] += m.amount;
              } else {
                ad['التحصيل'] += m.amount;
              }
              ad['الإجمالي'] += m.amount;
            }

            const total = Array.from(agentData.values()).reduce((sum, a) => sum + a['الإجمالي'], 0);
            newKpis.push({ label: 'إجمالي إنتاج الوكلاء (السنة الأولى)', value: formatCurrency(total), icon: Users, color: 'primary' });
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
  }, [profile, activeBranch, reportType, month, year, canViewAdmin]);

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
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <PageHeader
        title="التقارير التحليلية"
        subtitle={`تحليل أداء ${reportType === 'production' ? 'الإنتاج' : reportType === 'collection' ? 'التحصيل' : 'الفروع والوكلاء'} (السنة الأولى فقط)`}
        icon={BarChart}
        actions={
          <button
            onClick={handleExport}
            disabled={reportData.length === 0 || loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-success text-white rounded-xl hover:bg-success/90 transition-all shadow-crm font-black text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            تصدير إلى Excel
          </button>
        }
      />

      {/* Filters Bar */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-crm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider mr-1">نوع التقرير</label>
            <div className="relative">
              <FileText className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none"
              >
                <option value="production">تقرير الإنتاج</option>
                <option value="collection">تقرير التحصيل</option>
                {canViewAdmin && (
                  <>
                    <option value="branch_performance">أداء الفروع</option>
                    <option value="agent_performance">أداء الوكلاء</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider mr-1">الشهر</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('ar-EG', { month: 'long' })}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-wider mr-1">السنة</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full pr-10 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none"
              >
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={generateReport}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all font-black text-sm disabled:opacity-50 h-[46px]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            تحديث البيانات
          </button>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {kpis.map((kpi, index) => (
          <div key={index} className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-crm hover:shadow-crm-lg transition-all duration-300">
            <div className="flex items-center gap-4 mb-4">
              <div className={`p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20`}>
                <kpi.icon className="w-6 h-6" />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{kpi.label}</p>
            </div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{kpi.value}</h3>
          </div>
        ))}
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-crm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
              <PieChart className="w-5 h-5 text-primary" />
            </div>
            تفاصيل التقرير
          </h3>
        </div>
        <div className="overflow-x-auto">
          {reportData.length > 0 ? (
            <table className="w-full text-right">
              <thead>
                <tr className="bg-white dark:bg-slate-900">
                  {Object.keys(reportData[0]).map((key) => (
                    <th key={key} className="px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    {Object.values(row).map((val: any, vidx) => (
                      <td key={vidx} className="px-8 py-4">
                        <span className={`text-sm ${typeof val === 'number' ? 'font-black text-slate-900 dark:text-white' : 'font-bold text-slate-600 dark:text-slate-400'}`}>
                          {typeof val === 'number' ? formatCurrency(val) : val}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-8 py-20 text-center">
              <div className="flex flex-col items-center gap-4 opacity-20">
                <FileText className="w-16 h-16" />
                <p className="text-lg font-black">لا توجد بيانات للعرض حالياً</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


