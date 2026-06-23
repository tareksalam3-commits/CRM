import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatPercent, getMonthName } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Calendar, Lock, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface MonthData {
  newBusiness: number;
  collections: number;
  totalProduction: number;
  collectionRate: number;
}

interface AgentCollection {
  agentId: string;
  agentName: string;
  newBusiness: number;
  collections: number;
  totalProduction: number;
  count: number;
}

interface ExecutiveSummary {
  supervisor?: string;
  monitors?: string[];
  teamLeaders?: string[];
  agents?: string[];
  target: number;
  achieved: number;
  achievementRate: number;
  newBusiness: number;
  collections: number;
}

export default function MonthClosing() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthData, setMonthData] = useState<MonthData>({
    newBusiness: 0,
    collections: 0,
    totalProduction: 0,
    collectionRate: 0,
  });
  const [isCurrentClosed, setIsCurrentClosed] = useState(false);
  const [agentCollections, setAgentCollections] = useState<AgentCollection[]>([]);
  const [executiveSummary, setExecutiveSummary] = useState<ExecutiveSummary>({
    target: 0,
    achieved: 0,
    achievementRate: 0,
    newBusiness: 0,
    collections: 0,
  });

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  async function loadData() {
    setLoading(true);
    try {
      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      // Fetch unified metrics (first year only)
      const [metricsRes, targetsRes, closingsRes] = await Promise.all([
        supabase
          .from('unified_performance_metrics')
          .select('*, collector:profiles!collections_collected_by_fkey(full_name)')
          .gte('collection_date', monthStart)
          .lt('collection_date', monthEnd)
          .eq('is_first_year_collection', true),
        supabase
          .from('targets')
          .select('target_amount, user_id')
          .eq('period_type', 'monthly')
          .eq('period_number', selectedMonth)
          .eq('year', selectedYear),
        supabase.from('month_closings').select('month, year'),
      ]);

      const metrics = metricsRes.data || [];
      const targets = targetsRes.data || [];

      // Calculate totals based on is_new_business flag
      const newBusiness = metrics
        .filter(m => m.is_new_business === true)
        .reduce((s, m) => s + Number(m.amount), 0);

      const collections = metrics
        .filter(m => m.is_new_business === false)
        .reduce((s, m) => s + Number(m.amount), 0);

      const totalProduction = newBusiness + collections;
      const totalTarget = targets.reduce((s, t) => s + Number(t.target_amount), 0);

      setMonthData({
        newBusiness,
        collections,
        totalProduction,
        collectionRate: totalTarget > 0 ? (totalProduction / totalTarget) * 100 : 0,
      });

      // Build agent collections map (first year only)
      const agentMap = new Map<string, AgentCollection>();
      for (const m of metrics) {
        const agentId = m.agent_id;
        const existing = agentMap.get(agentId) || {
          agentId,
          agentName: m.collector?.full_name || 'غير معروف',
          newBusiness: 0,
          collections: 0,
          totalProduction: 0,
          count: 0,
        };

        const amount = Number(m.amount);
        if (m.is_new_business) {
          existing.newBusiness += amount;
        } else {
          existing.collections += amount;
        }
        existing.totalProduction += amount;
        existing.count += 1;

        agentMap.set(agentId, existing);
      }

      setAgentCollections(Array.from(agentMap.values()));

      // Build executive summary
      setExecutiveSummary({
        target: totalTarget,
        achieved: totalProduction,
        achievementRate: totalTarget > 0 ? (totalProduction / totalTarget) * 100 : 0,
        newBusiness,
        collections,
      });

      setIsCurrentClosed(closingsRes.data?.some(c => c.month === selectedMonth && c.year === selectedYear) || false);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }

  async function closeMonth() {
    if (!confirm(`هل أنت متأكد من تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}؟`)) return;

    try {
      const { error } = await supabase.from('month_closings').insert({
        month: selectedMonth,
        year: selectedYear,
        closed_by: profile?.id,
        closed_at: new Date().toISOString(),
      });

      if (error) throw error;
      toast.success('✅ تم تقفيل الشهر بنجاح');
      setIsCurrentClosed(true);
    } catch (error: any) {
      toast.error('خطأ في تقفيل الشهر: ' + error.message);
    }
  }

  const exportToExcel = () => {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive Summary
      const summaryData = [
        ['الملخص الإداري'],
        ['الهدف', executiveSummary.target],
        ['المحقق', executiveSummary.achieved],
        ['نسبة الإنجاز %', executiveSummary.achievementRate.toFixed(2)],
        ['الإنتاج الجديد', executiveSummary.newBusiness],
        ['التحصيل', executiveSummary.collections],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'الملخص');

      // Sheet 2: Agent Details
      const agentData = agentCollections.map(a => ({
        'المندوب': a.agentName,
        'الجديد': a.newBusiness,
        'التحصيل': a.collections,
        'الإجمالي': a.totalProduction,
      }));
      const agentSheet = XLSX.utils.json_to_sheet(agentData);
      XLSX.utils.book_append_sheet(wb, agentSheet, 'تفاصيل العمليات');

      // Sheet 3: Totals
      const totalsData = [
        ['الإجماليات النهائية'],
        ['إجمالي الجديد', executiveSummary.newBusiness],
        ['إجمالي التحصيل', executiveSummary.collections],
        ['إجمالي الإنتاج', executiveSummary.achieved],
        ['عدد المندوبين', agentCollections.length],
      ];
      const totalsSheet = XLSX.utils.aoa_to_sheet(totalsData);
      XLSX.utils.book_append_sheet(wb, totalsSheet, 'الإجماليات');

      XLSX.writeFile(wb, `تقرير_تقفيل_${selectedMonth}_${selectedYear}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      doc.setLanguage('ar');

      // Title
      doc.setFontSize(16);
      doc.text(`تقرير تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}`, 10, 20);

      // Executive Summary
      doc.setFontSize(12);
      doc.text('الملخص الإداري:', 10, 35);
      (doc as any).autoTable({
        head: [['البيان', 'القيمة']],
        body: [
          ['الهدف', formatCurrency(executiveSummary.target)],
          ['المحقق', formatCurrency(executiveSummary.achieved)],
          ['نسبة الإنجاز %', formatPercent(executiveSummary.achievementRate)],
          ['الإنتاج الجديد', formatCurrency(executiveSummary.newBusiness)],
          ['التحصيل', formatCurrency(executiveSummary.collections)],
        ],
        startY: 40,
        margin: 10,
      });

      // Agent Details
      let yPosition = (doc as any).lastAutoTable.finalY + 10;
      doc.text('تفاصيل العمليات:', 10, yPosition);
      (doc as any).autoTable({
        head: [['المندوب', 'الجديد', 'التحصيل', 'الإجمالي']],
        body: agentCollections.map(a => [
          a.agentName,
          formatCurrency(a.newBusiness),
          formatCurrency(a.collections),
          formatCurrency(a.totalProduction),
        ]),
        startY: yPosition + 5,
        margin: 10,
      });

      // Totals
      yPosition = (doc as any).lastAutoTable.finalY + 10;
      doc.text('الإجماليات النهائية:', 10, yPosition);
      (doc as any).autoTable({
        head: [['البيان', 'القيمة']],
        body: [
          ['إجمالي الجديد', formatCurrency(executiveSummary.newBusiness)],
          ['إجمالي التحصيل', formatCurrency(executiveSummary.collections)],
          ['إجمالي الإنتاج', formatCurrency(executiveSummary.achieved)],
          ['عدد المندوبين', agentCollections.length.toString()],
        ],
        startY: yPosition + 5,
        margin: 10,
      });

      doc.save(`تقرير_تقفيل_${selectedMonth}_${selectedYear}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقفيل الشهر (السنة الأولى فقط)"
        icon={Calendar}
        actions={!isCurrentClosed && (
          <button onClick={closeMonth} className="px-4 py-2 bg-rose-600 text-white rounded-xl flex items-center gap-2">
            <Lock className="w-4 h-4" /> تقفيل الشهر
          </button>
        )}
      />

      <div className="flex gap-4">
        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="p-2 border rounded-xl">
          {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
        </select>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="p-2 border rounded-xl">
          {Array.from({ length: 5 }, (_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-1">الإنتاج الجديد</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(monthData.newBusiness)}</p>
        </div>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-1">التحصيل</p>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(monthData.collections)}</p>
        </div>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-1">إجمالي الإنتاج</p>
          <p className="text-2xl font-bold text-indigo-600">{formatCurrency(monthData.totalProduction)}</p>
        </div>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-1">نسبة الإنجاز</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatPercent(monthData.collectionRate)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={exportToExcel} disabled={exporting} className="px-4 py-2 bg-emerald-600 text-white rounded-xl flex items-center gap-2 hover:bg-emerald-700 disabled:opacity-50">
          <FileText className="w-4 h-4" /> Excel
        </button>
        <button onClick={exportToPDF} disabled={exporting} className="px-4 py-2 bg-rose-600 text-white rounded-xl flex items-center gap-2 hover:bg-rose-700 disabled:opacity-50">
          <FileText className="w-4 h-4" /> PDF
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-6 py-4 text-sm font-bold">المندوب</th>
              <th className="px-6 py-4 text-sm font-bold">الجديد</th>
              <th className="px-6 py-4 text-sm font-bold">التحصيل</th>
              <th className="px-6 py-4 text-sm font-bold">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {agentCollections.map(agent => (
              <tr key={agent.agentId}>
                <td className="px-6 py-4">{agent.agentName}</td>
                <td className="px-6 py-4 text-blue-600 font-bold">{formatCurrency(agent.newBusiness)}</td>
                <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(agent.collections)}</td>
                <td className="px-6 py-4 font-bold">{formatCurrency(agent.totalProduction)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
