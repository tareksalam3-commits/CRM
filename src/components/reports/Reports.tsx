import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, getMonthName } from '../../lib/utils';
import { canViewAdminReports } from '../../lib/rbac';
import PageHeader from '../common/PageHeader';
import { BarChart3, Download, Printer, TrendingUp, TrendingDown, Target, Users, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';

type ReportType = 'production' | 'collection' | 'overdue' | 'clients' | 'policies' | 'targets' | 'subordinate_production';

interface KPICard { label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral'; icon: React.ElementType; color: string; }

export default function Reports() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('production');
  const [reportData, setReportData] = useState<Record<string, unknown>[]>([]);
  const [kpis, setKpis] = useState<KPICard[]>([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [allProfiles, setAllProfiles] = useState<any[]>([]);

  const { activeBranchAccess } = useAuth();
  const canViewAdmin = activeBranchAccess ? canViewAdminReports(activeBranchAccess.role) : false;

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
        // ── Personal / team production ──────────────────────────────
        case 'production': {
          let query = supabase
            .from('unified_performance_metrics')
            .select('agent_id, amount, is_new_business, is_first_year_collection, collection_date')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd);

          if (activeBranchAccess?.role === 'agent') {
            query = query.eq('agent_id', profile?.id);
          } else if (activeBranchAccess && ['team_leader', 'supervisor', 'general_supervisor'].includes(activeBranchAccess.role)) {
            const subordinateIds = [profile.id, ...getSubordinateIds(profile.id, allProfiles)];
            query = query.in('agent_id', subordinateIds);
          }

          const { data: metrics, error: metricsError } = await query;
          if (metricsError) {
            console.error('Error fetching metrics:', metricsError);
            toast.error('خطأ في تحميل بيانات الإنتاج');
            setLoading(false);
            return;
          }

          const grouped: Record<string, { name: string; total: number; count: number; active: number }> = {};
          (metrics || []).forEach((m: any) => {
            const agentId = m.agent_id;
            const prof = allProfiles.find(p => p.id === agentId);
            if (!grouped[agentId]) grouped[agentId] = { name: prof?.full_name || 'غير معروف', total: 0, count: 0, active: 0 };
            
            // Only count if it's new business or a valid first-year collection
            if (m.is_new_business || m.is_first_year_collection) {
              grouped[agentId].total += Number(m.amount);
              grouped[agentId].count++;
            }
          });

          data = Object.values(grouped).sort((a, b) => (b as {total:number}).total - (a as {total:number}).total).map((r, i) => ({
            '#': i + 1,
            'الاسم': (r as {name:string}).name,
            'عدد الوثائق': (r as {count:number}).count,
            'وثائق سارية': (r as {active:number}).active,
            'إجمالي الأقساط': formatCurrency((r as {total:number}).total),
          }));

          const totalProd = Object.values(grouped).reduce((s, r) => s + (r as {total:number}).total, 0);
          const totalPolicies = Object.values(grouped).reduce((s, r) => s + (r as {count:number}).count, 0);
          newKpis.push(
            { label: 'إجمالي الإنتاج', value: formatCurrency(totalProd), icon: TrendingUp, color: 'text-blue-600', trend: 'neutral' },
            { label: 'عدد الوثائق', value: String(totalPolicies), icon: BarChart3, color: 'text-indigo-600', trend: 'neutral' },
            { label: 'عدد المندوبين', value: String(Object.keys(grouped).length), icon: Users, color: 'text-slate-600', trend: 'neutral' },
          );
          break;
        }

        // ── Collection ──────────────────────────────────────────────
        case 'collection': {
          let query = supabase
            .from('unified_performance_metrics')
            .select('agent_id, amount, is_new_business, is_first_year_collection, collection_date')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd);

          if (activeBranchAccess?.role === 'agent') {
            query = query.eq('agent_id', profile?.id);
          } else if (activeBranchAccess && ['team_leader', 'supervisor', 'general_supervisor'].includes(activeBranchAccess.role)) {
            const subordinateIds = [profile.id, ...getSubordinateIds(profile.id, allProfiles)];
            query = query.in('agent_id', subordinateIds);
          }

          const { data: metrics, error: metricsError } = await query;
          if (metricsError) {
            console.error('Error fetching metrics:', metricsError);
            toast.error('خطأ في تحميل بيانات التحصيل');
            setLoading(false);
            return;
          }

          const { data: installments, error: installmentsError } = await supabase
            .from('installments')
            .select('amount, due_date, policy:policies(agent_id, first_year_end)')
            .gte('due_date', monthStart)
            .lt('due_date', monthEnd);
            
          if (installmentsError) {
            console.error('Error fetching installments:', installmentsError);
            toast.error('خطأ في تحميل بيانات الأقساط');
            setLoading(false);
            return;
          }

          const grouped: Record<string, { name: string; total: number; count: number }> = {};
          (metrics || []).forEach((m: any) => {
            if (!m.is_first_year_collection) return; // Only count first year collections
            
            const agentId = m.agent_id;
            const prof = allProfiles.find(p => p.id === agentId);
            if (!grouped[agentId]) grouped[agentId] = { name: prof?.full_name || 'غير معروف', total: 0, count: 0 };
            grouped[agentId].total += Number(m.amount);
            grouped[agentId].count++;
          });

          data = Object.values(grouped).sort((a, b) => (b as {total:number}).total - (a as {total:number}).total).map((r, i) => ({
            '#': i + 1,
            'الاسم': (r as {name:string}).name,
            'عدد عمليات التحصيل': (r as {count:number}).count,
            'إجمالي المحصل': formatCurrency((r as {total:number}).total),
          }));

          const totalCollected = (metrics || [])
            .filter((m: any) => m.is_first_year_collection)
            .reduce((s, m: any) => s + Number(m.amount), 0);
            
          const totalDue = (installments || [])
            .filter((i: any) => i.due_date <= (i.policy?.first_year_end || '9999-12-31'))
            .reduce((s, i: any) => s + Number(i.amount), 0);
            
          const rate = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;

          newKpis.push(
            { label: 'إجمالي المحصل', value: formatCurrency(totalCollected), icon: Wallet, color: 'text-emerald-600', trend: 'up' },
            { label: 'إجمالي المستحق', value: formatCurrency(totalDue), icon: Target, color: 'text-amber-600', trend: 'neutral' },
            { label: 'نسبة التحصيل', value: `${rate.toFixed(1)}%`, icon: TrendingUp, color: rate >= 70 ? 'text-emerald-600' : 'text-red-600', trend: rate >= 70 ? 'up' : 'down' },
          );
          break;
        }

        // ── Overdue ──────────────────────────────────────────────────
        case 'overdue': {
          const { data: installments } = await supabase
            .from('installments')
            .select('amount, due_date, policy:policies(policy_number, client:clients(name), agent:profiles!policies_agent_id_fkey(full_name))')
            .eq('status', 'overdue')
            .order('due_date');

          data = (installments || []).map((i: Record<string, unknown>) => {
            const pol = i.policy as Record<string, unknown> | null;
            const client = pol?.client as Record<string, unknown> | null;
            const agent = pol?.agent as Record<string, unknown> | null;
            return {
              'رقم الوثيقة': pol?.policy_number ?? '—',
              'العميل': client?.name ?? '—',
              'المندوب': agent?.full_name ?? '—',
              'المبلغ المستحق': formatCurrency(Number(i.amount)),
              'تاريخ الاستحقاق': i.due_date as string,
            };
          });

          const totalOverdue = (installments || []).reduce((s, i: Record<string, unknown>) => s + Number(i.amount), 0);
          newKpis.push(
            { label: 'عدد الأقساط المتأخرة', value: String((installments || []).length), icon: TrendingDown, color: 'text-red-600', trend: 'down' },
            { label: 'إجمالي المتأخرات', value: formatCurrency(totalOverdue), icon: Wallet, color: 'text-red-600', trend: 'down' },
          );
          break;
        }

        // ── Subordinate production (managers only) ──────────────────
        case 'subordinate_production': {
          if (!canViewAdmin) { toast.error('غير مصرح'); break; }

          const { data: allProfiles } = await supabase.from('profiles').select('id, full_name, role, manager_id').eq('is_active', true);
          const { data: policies } = await supabase
            .from('policies')
            .select('agent_id, annual_premium, created_at')
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd);

          const profiles = allProfiles || [];
          const policyList = policies || [];

          // Group by agent
          const byAgent: Record<string, { name: string; managerName: string; total: number; count: number }> = {};
          policyList.forEach((p: Record<string, unknown>) => {
            const agentId = p.agent_id as string;
            const agentProf = profiles.find(pr => pr.id === agentId);
            if (!agentProf) return;
            const managerProf = agentProf.manager_id ? profiles.find(pr => pr.id === agentProf.manager_id) : null;
            if (!byAgent[agentId]) byAgent[agentId] = {
              name: agentProf.full_name,
              managerName: managerProf?.full_name || '—',
              total: 0, count: 0,
            };
            byAgent[agentId].total += Number(p.annual_premium);
            byAgent[agentId].count++;
          });

          data = Object.values(byAgent).sort((a, b) => (b as {total:number}).total - (a as {total:number}).total).map((r, i) => ({
            '#': i + 1,
            'المندوب': (r as {name:string}).name,
            'المدير المباشر': (r as {managerName:string}).managerName,
            'عدد الوثائق': (r as {count:number}).count,
            'إجمالي الإنتاج': formatCurrency((r as {total:number}).total),
          }));

          const grandTotal = Object.values(byAgent).reduce((s, r) => s + (r as {total:number}).total, 0);
          newKpis.push(
            { label: 'إجمالي إنتاج الفريق', value: formatCurrency(grandTotal), icon: TrendingUp, color: 'text-blue-600', trend: 'up' },
            { label: 'عدد المندوبين النشطين', value: String(Object.keys(byAgent).length), icon: Users, color: 'text-indigo-600', trend: 'neutral' },
          );
          break;
        }

        // ── Targets comparison ──────────────────────────────────────
        case 'targets': {
          const { data: targets } = await supabase
            .from('targets')
            .select('user_id, target_amount, period_type, year, period_number, user:profiles(full_name, role)')
            .eq('period_type', 'monthly')
            .eq('year', year)
            .eq('period_number', month);

          const { data: policies } = await supabase
            .from('policies')
            .select('agent_id, annual_premium')
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd);

          const prodByAgent: Record<string, number> = {};
          (policies || []).forEach((p: Record<string, unknown>) => {
            const id = p.agent_id as string;
            prodByAgent[id] = (prodByAgent[id] || 0) + Number(p.annual_premium);
          });

          data = (targets || []).map((t: Record<string, unknown>) => {
            const userId = t.user_id as string;
            const achieved = prodByAgent[userId] || 0;
            const target = Number(t.target_amount);
            const pct = target > 0 ? ((achieved / target) * 100).toFixed(1) + '%' : '—';
            const userObj = t.user as { full_name: string; role: string } | null;
            return {
              'الاسم': userObj?.full_name ?? '—',
              'التارجت': formatCurrency(target),
              'المحقق': formatCurrency(achieved),
              'النسبة': pct,
              'الحالة': achieved >= target ? '✅ محقق' : '⚠️ لم يتحقق',
            };
          });
          break;
        }

        // ── Clients ─────────────────────────────────────────────────
        case 'clients': {
          const { data: clients } = await supabase
            .from('clients')
            .select('name, phone, agent:profiles!clients_agent_id_fkey(full_name), created_at')
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd)
            .order('created_at', { ascending: false });

          data = (clients || []).map((c: Record<string, unknown>) => {
            const agent = c.agent as { full_name: string } | null;
            return {
              'الاسم': c.name as string,
              'الهاتف': c.phone as string,
              'المندوب': agent?.full_name ?? '—',
              'تاريخ الإضافة': (c.created_at as string).slice(0, 10),
            };
          });
          newKpis.push({ label: 'عدد العملاء الجدد', value: String(data.length), icon: Users, color: 'text-blue-600', trend: 'neutral' });
          break;
        }

        // ── Policies ─────────────────────────────────────────────────
        case 'policies': {
          const { data: policies } = await supabase
            .from('policies')
            .select('policy_number, product, annual_premium, status, client:clients(name), agent:profiles!policies_agent_id_fkey(full_name)')
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd);

          data = (policies || []).map((p: Record<string, unknown>) => {
            const client = p.client as { name: string } | null;
            const agent = p.agent as { full_name: string } | null;
            return {
              'رقم الوثيقة': p.policy_number as string,
              'المنتج': p.product as string,
              'العميل': client?.name ?? '—',
              'المندوب': agent?.full_name ?? '—',
              'القسط السنوي': formatCurrency(Number(p.annual_premium)),
              'الحالة': p.status as string,
            };
          });
          break;
        }

        default:
          data = [];
      }

      setReportData(data);
      setKpis(newKpis);
    } catch (err) {
      // FIX #R1: Detailed error message
      toast.error('خطأ: ' + (err instanceof Error ? err.message : String(err)));
      console.error('[Reports]', err);
    }
    setLoading(false);
  }, [profile, reportType, month, year, canViewAdmin]);

  async function exportExcel() {
    // FIX #R2: Guard empty data + try/catch
    if (reportData.length === 0) { toast.error('لا توجد بيانات للتصدير'); return; }
    try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${reportType}_${year}_${month}.xlsx`);
    toast.success('تم التصدير بنجاح');
    } catch (err) { toast.error('فشل التصدير: ' + (err instanceof Error ? err.message : String(err))); }
  }

  const reportTypes: { key: ReportType; label: string; adminOnly?: boolean }[] = [
    { key: 'production', label: 'تقرير الإنتاج' },
    { key: 'collection', label: 'تقرير التحصيل' },
    { key: 'overdue', label: 'تقرير المتأخرات' },
    { key: 'clients', label: 'تقرير العملاء' },
    { key: 'policies', label: 'تقرير الوثائق' },
    { key: 'targets', label: 'مقارنة التارجت', adminOnly: true },
    { key: 'subordinate_production', label: 'إنتاج الفريق', adminOnly: true },
  ];

  const visibleTypes = reportTypes.filter(r => !r.adminOnly || canViewAdmin);

  const trendIcon = (t?: 'up' | 'down' | 'neutral') =>
    t === 'up' ? <TrendingUp className="w-4 h-4" /> : t === 'down' ? <TrendingDown className="w-4 h-4" /> : null;

  return (
    <div>
      <PageHeader title="التقارير الإدارية" description="إنشاء وتصدير التقارير" icon={BarChart3} />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">نوع التقرير</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
              {visibleTypes.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الشهر</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={generateReport} disabled={loading} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors text-sm">
              {loading ? 'جاري التحميل...' : 'إنشاء التقرير'}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {kpis.map((k, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center ${k.color}`}>
                <k.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{k.label}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-1">
                  {k.value}
                  <span className={k.color}>{trendIcon(k.trend)}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {reportData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">{reportData.length} نتيجة</p>
            <div className="flex gap-2">
              <button onClick={exportExcel} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors">
                <Download className="w-3.5 h-3.5" /> Excel
              </button>
              <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors">
                <Printer className="w-3.5 h-3.5" /> طباعة
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {Object.keys(reportData[0]).map(key => (
                    <th key={key} className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {reportData.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {Object.values(row).map((val, i) => (
                      <td key={i} className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {String(val ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reportData.length > 100 && (
            <p className="text-center text-xs text-slate-400 py-3">يُعرض أول 100 نتيجة — صدّر إلى Excel لرؤية الكل</p>
          )}
        </div>
      )}

      {reportData.length === 0 && !loading && (
        <div className="text-center py-16">
          <BarChart3 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">اختر نوع التقرير واضغط "إنشاء التقرير"</p>
        </div>
      )}
    </div>
  );
}
