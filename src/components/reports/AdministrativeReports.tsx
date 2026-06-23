import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatPercent, getMonthName } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { BarChart, Download, Calendar, Users, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

type ReportType = 'supervisors' | 'team_leaders' | 'agents' | 'branches' | 'comprehensive';

interface ReportData {
  name: string;
  newBusiness: number;
  collections: number;
  total: number;
  subordinateCount?: number;
}

interface ComprehensiveReport {
  generalSummary: {
    target: number;
    achieved: number;
    achievementRate: number;
    newBusiness: number;
    collections: number;
  };
  supervisors: ReportData[];
  teamLeaders: ReportData[];
  agents: ReportData[];
  branches: ReportData[];
}

export default function AdministrativeReports() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('comprehensive');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [comprehensiveData, setComprehensiveData] = useState<ComprehensiveReport | null>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      // Fetch all metrics for the period (first year only)
      const { data: metrics } = await supabase
        .from('unified_performance_metrics')
        .select(`
          *,
          policy:policies(
            policy_number,
            agent_id,
            team_leader_id,
            supervisor_id,
            branch_id,
            agent:profiles(full_name),
            team_leader:profiles!policies_team_leader_id_fkey(full_name),
            supervisor:profiles!policies_supervisor_id_fkey(full_name),
            branch:branches(name)
          )
        `)
        .gte('collection_date', monthStart)
        .lt('collection_date', monthEnd)
        .eq('is_first_year_collection', true);

      // Fetch targets
      const { data: targets } = await supabase
        .from('targets')
        .select('target_amount')
        .eq('period_type', 'monthly')
        .eq('period_number', selectedMonth)
        .eq('year', selectedYear);

      const allMetrics = metrics || [];
      const totalTarget = targets?.reduce((s, t) => s + Number(t.target_amount), 0) || 0;

      // Calculate comprehensive data
      const supervisorMap = new Map<string, any>();
      const teamLeaderMap = new Map<string, any>();
      const agentMap = new Map<string, any>();
      const branchMap = new Map<string, any>();

      let totalNewBusiness = 0;
      let totalCollections = 0;

      for (const m of allMetrics) {
        const policy = m.policy as any;
        if (!policy) continue;

        const amount = Number(m.amount);
        const isNew = m.is_new_business;

        if (isNew) totalNewBusiness += amount;
        else totalCollections += amount;

        // Supervisor level
        if (policy.supervisor_id) {
          if (!supervisorMap.has(policy.supervisor_id)) {
            supervisorMap.set(policy.supervisor_id, {
              id: policy.supervisor_id,
              name: policy.supervisor?.full_name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
              total: 0,
            });
          }
          const sup = supervisorMap.get(policy.supervisor_id);
          if (isNew) sup.newBusiness += amount;
          else sup.collections += amount;
          sup.total += amount;
        }

        // Team Leader level
        if (policy.team_leader_id) {
          if (!teamLeaderMap.has(policy.team_leader_id)) {
            teamLeaderMap.set(policy.team_leader_id, {
              id: policy.team_leader_id,
              name: policy.team_leader?.full_name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
              total: 0,
            });
          }
          const tl = teamLeaderMap.get(policy.team_leader_id);
          if (isNew) tl.newBusiness += amount;
          else tl.collections += amount;
          tl.total += amount;
        }

        // Agent level
        if (policy.agent_id) {
          if (!agentMap.has(policy.agent_id)) {
            agentMap.set(policy.agent_id, {
              id: policy.agent_id,
              name: policy.agent?.full_name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
              total: 0,
            });
          }
          const agent = agentMap.get(policy.agent_id);
          if (isNew) agent.newBusiness += amount;
          else agent.collections += amount;
          agent.total += amount;
        }

        // Branch level
        if (policy.branch_id) {
          if (!branchMap.has(policy.branch_id)) {
            branchMap.set(policy.branch_id, {
              id: policy.branch_id,
              name: policy.branch?.name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
              total: 0,
            });
          }
          const branch = branchMap.get(policy.branch_id);
          if (isNew) branch.newBusiness += amount;
          else branch.collections += amount;
          branch.total += amount;
        }
      }

      const totalProduction = totalNewBusiness + totalCollections;

      const comprehensive: ComprehensiveReport = {
        generalSummary: {
          target: totalTarget,
          achieved: totalProduction,
          achievementRate: totalTarget > 0 ? (totalProduction / totalTarget) * 100 : 0,
          newBusiness: totalNewBusiness,
          collections: totalCollections,
        },
        supervisors: Array.from(supervisorMap.values()).sort((a, b) => b.total - a.total),
        teamLeaders: Array.from(teamLeaderMap.values()).sort((a, b) => b.total - a.total),
        agents: Array.from(agentMap.values()).sort((a, b) => b.total - a.total),
        branches: Array.from(branchMap.values()).sort((a, b) => b.total - a.total),
      };

      setComprehensiveData(comprehensive);

      // Set report data based on type
      switch (reportType) {
        case 'supervisors':
          setReportData(comprehensive.supervisors);
          break;
        case 'team_leaders':
          setReportData(comprehensive.teamLeaders);
          break;
        case 'agents':
          setReportData(comprehensive.agents);
          break;
        case 'branches':
          setReportData(comprehensive.branches);
          break;
        default:
          setReportData([]);
      }
    } catch (error) {
      console.error('Report generation error:', error);
      toast.error('خطأ في إنشاء التقرير');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, reportType]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  const exportToExcel = () => {
    if (!comprehensiveData) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: General Summary
      const summaryData = [
        ['الملخص العام'],
        ['الهدف', comprehensiveData.generalSummary.target],
        ['المحقق', comprehensiveData.generalSummary.achieved],
        ['نسبة الإنجاز %', comprehensiveData.generalSummary.achievementRate.toFixed(2)],
        ['الإنتاج الجديد', comprehensiveData.generalSummary.newBusiness],
        ['التحصيل', comprehensiveData.generalSummary.collections],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'الملخص العام');

      // Sheet 2: Supervisors
      const supervisorData = comprehensiveData.supervisors.map(s => ({
        'المراقب': s.name,
        'الجديد': s.newBusiness,
        'التحصيل': s.collections,
        'الإجمالي': s.total,
      }));
      const supervisorSheet = XLSX.utils.json_to_sheet(supervisorData);
      XLSX.utils.book_append_sheet(wb, supervisorSheet, 'المراقبين');

      // Sheet 3: Team Leaders
      const teamLeaderData = comprehensiveData.teamLeaders.map(tl => ({
        'رئيس المجموعة': tl.name,
        'الجديد': tl.newBusiness,
        'التحصيل': tl.collections,
        'الإجمالي': tl.total,
      }));
      const teamLeaderSheet = XLSX.utils.json_to_sheet(teamLeaderData);
      XLSX.utils.book_append_sheet(wb, teamLeaderSheet, 'رؤساء المجموعات');

      // Sheet 4: Agents
      const agentData = comprehensiveData.agents.map(a => ({
        'الوكيل': a.name,
        'الجديد': a.newBusiness,
        'التحصيل': a.collections,
        'الإجمالي': a.total,
      }));
      const agentSheet = XLSX.utils.json_to_sheet(agentData);
      XLSX.utils.book_append_sheet(wb, agentSheet, 'الوكلاء');

      // Sheet 5: Branches
      const branchData = comprehensiveData.branches.map(b => ({
        'الفرع': b.name,
        'الجديد': b.newBusiness,
        'التحصيل': b.collections,
        'الإجمالي': b.total,
      }));
      const branchSheet = XLSX.utils.json_to_sheet(branchData);
      XLSX.utils.book_append_sheet(wb, branchSheet, 'الفروع');

      XLSX.writeFile(wb, `تقرير_إداري_شامل_${selectedMonth}_${selectedYear}.xlsx`);
      toast.success('تم تصدير التقرير بنجاح');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('خطأ في تصدير التقرير');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    if (!comprehensiveData) return;
    setExporting(true);
    try {
      const doc = new jsPDF();
      doc.setLanguage('ar');

      // Title
      doc.setFontSize(16);
      doc.text(`التقرير الإداري الشامل - شهر ${getMonthName(selectedMonth)} ${selectedYear}`, 10, 20);

      // General Summary
      doc.setFontSize(12);
      doc.text('الملخص العام:', 10, 35);
      (doc as any).autoTable({
        head: [['البيان', 'القيمة']],
        body: [
          ['الهدف', formatCurrency(comprehensiveData.generalSummary.target)],
          ['المحقق', formatCurrency(comprehensiveData.generalSummary.achieved)],
          ['نسبة الإنجاز %', formatPercent(comprehensiveData.generalSummary.achievementRate)],
          ['الإنتاج الجديد', formatCurrency(comprehensiveData.generalSummary.newBusiness)],
          ['التحصيل', formatCurrency(comprehensiveData.generalSummary.collections)],
        ],
        startY: 40,
        margin: 10,
      });

      // Supervisors
      let yPosition = (doc as any).lastAutoTable.finalY + 10;
      doc.text('المراقبين:', 10, yPosition);
      (doc as any).autoTable({
        head: [['المراقب', 'الجديد', 'التحصيل', 'الإجمالي']],
        body: comprehensiveData.supervisors.map(s => [
          s.name,
          formatCurrency(s.newBusiness),
          formatCurrency(s.collections),
          formatCurrency(s.total),
        ]),
        startY: yPosition + 5,
        margin: 10,
      });

      // Team Leaders
      yPosition = (doc as any).lastAutoTable.finalY + 10;
      doc.text('رؤساء المجموعات:', 10, yPosition);
      (doc as any).autoTable({
        head: [['رئيس المجموعة', 'الجديد', 'التحصيل', 'الإجمالي']],
        body: comprehensiveData.teamLeaders.map(tl => [
          tl.name,
          formatCurrency(tl.newBusiness),
          formatCurrency(tl.collections),
          formatCurrency(tl.total),
        ]),
        startY: yPosition + 5,
        margin: 10,
      });

      // Agents
      yPosition = (doc as any).lastAutoTable.finalY + 10;
      doc.text('الوكلاء:', 10, yPosition);
      (doc as any).autoTable({
        head: [['الوكيل', 'الجديد', 'التحصيل', 'الإجمالي']],
        body: comprehensiveData.agents.map(a => [
          a.name,
          formatCurrency(a.newBusiness),
          formatCurrency(a.collections),
          formatCurrency(a.total),
        ]),
        startY: yPosition + 5,
        margin: 10,
      });

      // Branches
      yPosition = (doc as any).lastAutoTable.finalY + 10;
      doc.text('الفروع:', 10, yPosition);
      (doc as any).autoTable({
        head: [['الفرع', 'الجديد', 'التحصيل', 'الإجمالي']],
        body: comprehensiveData.branches.map(b => [
          b.name,
          formatCurrency(b.newBusiness),
          formatCurrency(b.collections),
          formatCurrency(b.total),
        ]),
        startY: yPosition + 5,
        margin: 10,
      });

      doc.save(`تقرير_إداري_شامل_${selectedMonth}_${selectedYear}.pdf`);
      toast.success('تم تصدير التقرير بنجاح');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('خطأ في تصدير التقرير');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير الإدارية الشاملة (السنة الأولى فقط)"
        icon={BarChart}
        description="تحليل الأداء على جميع المستويات الإدارية"
      />

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex gap-2">
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="p-2 border rounded-xl">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="p-2 border rounded-xl">
            {Array.from({ length: 5 }, (_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
          </select>
        </div>

        <div className="flex gap-2 md:ml-auto">
          <button onClick={exportToExcel} disabled={exporting} className="px-4 py-2 bg-emerald-600 text-white rounded-xl flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportToPDF} disabled={exporting} className="px-4 py-2 bg-rose-600 text-white rounded-xl flex items-center gap-2 hover:bg-rose-700 disabled:opacity-50">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {comprehensiveData && (
        <>
          {/* General Summary */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500 mb-1">الهدف</p>
              <p className="text-2xl font-bold">{formatCurrency(comprehensiveData.generalSummary.target)}</p>
            </div>
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500 mb-1">المحقق</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(comprehensiveData.generalSummary.achieved)}</p>
            </div>
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500 mb-1">نسبة الإنجاز</p>
              <p className="text-2xl font-bold text-green-600">{formatPercent(comprehensiveData.generalSummary.achievementRate)}</p>
            </div>
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500 mb-1">الجديد</p>
              <p className="text-2xl font-bold text-indigo-600">{formatCurrency(comprehensiveData.generalSummary.newBusiness)}</p>
            </div>
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500 mb-1">التحصيل</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(comprehensiveData.generalSummary.collections)}</p>
            </div>
          </div>

          {/* Supervisors Table */}
          {comprehensiveData.supervisors.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg">المراقبين ({comprehensiveData.supervisors.length})</h3>
              </div>
              <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold">الترتيب</th>
                    <th className="px-6 py-4 text-sm font-bold">المراقب</th>
                    <th className="px-6 py-4 text-sm font-bold">الجديد</th>
                    <th className="px-6 py-4 text-sm font-bold">التحصيل</th>
                    <th className="px-6 py-4 text-sm font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comprehensiveData.supervisors.map((s, idx) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-bold">{idx + 1}</td>
                      <td className="px-6 py-4">{s.name}</td>
                      <td className="px-6 py-4 text-blue-600 font-bold">{formatCurrency(s.newBusiness)}</td>
                      <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(s.collections)}</td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Team Leaders Table */}
          {comprehensiveData.teamLeaders.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg">رؤساء المجموعات ({comprehensiveData.teamLeaders.length})</h3>
              </div>
              <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold">الترتيب</th>
                    <th className="px-6 py-4 text-sm font-bold">رئيس المجموعة</th>
                    <th className="px-6 py-4 text-sm font-bold">الجديد</th>
                    <th className="px-6 py-4 text-sm font-bold">التحصيل</th>
                    <th className="px-6 py-4 text-sm font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comprehensiveData.teamLeaders.map((tl, idx) => (
                    <tr key={tl.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-bold">{idx + 1}</td>
                      <td className="px-6 py-4">{tl.name}</td>
                      <td className="px-6 py-4 text-blue-600 font-bold">{formatCurrency(tl.newBusiness)}</td>
                      <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(tl.collections)}</td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(tl.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Agents Table */}
          {comprehensiveData.agents.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg">الوكلاء ({comprehensiveData.agents.length})</h3>
              </div>
              <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold">الترتيب</th>
                    <th className="px-6 py-4 text-sm font-bold">الوكيل</th>
                    <th className="px-6 py-4 text-sm font-bold">الجديد</th>
                    <th className="px-6 py-4 text-sm font-bold">التحصيل</th>
                    <th className="px-6 py-4 text-sm font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comprehensiveData.agents.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-bold">{idx + 1}</td>
                      <td className="px-6 py-4">{a.name}</td>
                      <td className="px-6 py-4 text-blue-600 font-bold">{formatCurrency(a.newBusiness)}</td>
                      <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(a.collections)}</td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(a.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Branches Table */}
          {comprehensiveData.branches.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h3 className="font-bold text-lg">الفروع ({comprehensiveData.branches.length})</h3>
              </div>
              <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold">الترتيب</th>
                    <th className="px-6 py-4 text-sm font-bold">الفرع</th>
                    <th className="px-6 py-4 text-sm font-bold">الجديد</th>
                    <th className="px-6 py-4 text-sm font-bold">التحصيل</th>
                    <th className="px-6 py-4 text-sm font-bold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comprehensiveData.branches.map((b, idx) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm font-bold">{idx + 1}</td>
                      <td className="px-6 py-4">{b.name}</td>
                      <td className="px-6 py-4 text-blue-600 font-bold">{formatCurrency(b.newBusiness)}</td>
                      <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(b.collections)}</td>
                      <td className="px-6 py-4 font-bold">{formatCurrency(b.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
