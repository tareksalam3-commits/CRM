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
  firstYearCollections: number;
  renewalCollections: number;
  totalCollected: number;
  collectionRate: number;
}

interface AgentCollection {
  agentId: string;
  agentName: string;
  newBusiness: number;
  firstYearCollections: number;
  renewalCollections: number;
  totalCollected: number;
  count: number;
}

export default function MonthClosing() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthData, setMonthData] = useState<MonthData>({
    newBusiness: 0,
    firstYearCollections: 0,
    renewalCollections: 0,
    totalCollected: 0,
    collectionRate: 0,
  });
  const [isCurrentClosed, setIsCurrentClosed] = useState(false);
  const [agentCollections, setAgentCollections] = useState<AgentCollection[]>([]);

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

      const [metricsRes, installmentsRes, closingsRes] = await Promise.all([
        supabase
          .from('unified_performance_metrics')
          .select('*, collector:profiles!collections_collected_by_fkey(full_name)')
          .gte('collection_date', monthStart)
          .lt('collection_date', monthEnd),
        supabase
          .from('installments')
          .select('amount, due_date, policy:policies(first_year_end)')
          .gte('due_date', monthStart)
          .lt('due_date', monthEnd),
        supabase.from('month_closings').select('month, year'),
      ]);

      const metrics = metricsRes.data || [];
      const installments = installmentsRes.data || [];

      const newBusiness = metrics.filter(m => m.collection_category === 'new').reduce((s, m) => s + Number(m.amount), 0);
      const firstYearCollections = metrics.filter(m => m.collection_category === 'first_year').reduce((s, m) => s + Number(m.amount), 0);
      const renewalCollections = metrics.filter(m => m.collection_category === 'renewal').reduce((s, m) => s + Number(m.amount), 0);
      const totalCollected = newBusiness + firstYearCollections + renewalCollections;
      
      const firstYearDue = installments
        .filter(i => i.due_date <= (i.policy?.first_year_end || '9999-12-31'))
        .reduce((s, i) => s + Number(i.amount), 0);

      setMonthData({
        newBusiness,
        firstYearCollections,
        renewalCollections,
        totalCollected,
        collectionRate: firstYearDue > 0 ? (firstYearCollections / firstYearDue) * 100 : 0,
      });

      const agentMap = new Map<string, AgentCollection>();
      for (const m of metrics) {
        const agentId = m.agent_id;
        const existing = agentMap.get(agentId) || { 
          agentId, 
          agentName: m.collector?.full_name || 'غير معروف', 
          newBusiness: 0, 
          firstYearCollections: 0, 
          renewalCollections: 0, 
          totalCollected: 0, 
          count: 0 
        };
        
        const amount = Number(m.amount);
        existing.newBusiness += m.collection_category === 'new' ? amount : 0;
        existing.firstYearCollections += m.collection_category === 'first_year' ? amount : 0;
        existing.renewalCollections += m.collection_category === 'renewal' ? amount : 0;
        existing.totalCollected += amount;
        existing.count += 1;
        
        agentMap.set(agentId, existing);
      }

      setAgentCollections(Array.from(agentMap.values()));
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
    const ws = XLSX.utils.json_to_sheet(agentCollections.map(a => ({
      'المندوب': a.agentName,
      'الجديد': a.newBusiness,
      'تحصيل أول سنة': a.firstYearCollections,
      'تحصيل تالي': a.renewalCollections,
      'الإجمالي': a.totalCollected,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    XLSX.writeFile(wb, `تقرير_${selectedMonth}_${selectedYear}.xlsx`);
    setExporting(false);
  };

  const exportToPDF = () => {
    setExporting(true);
    const doc = new jsPDF();
    doc.text(`تقرير تقفيل شهر ${selectedMonth}/${selectedYear}`, 10, 10);
    (doc as any).autoTable({
      head: [['المندوب', 'الجديد', 'أول سنة', 'سنوات تالية', 'الإجمالي']],
      body: agentCollections.map(a => [a.agentName, a.newBusiness, a.firstYearCollections, a.renewalCollections, a.totalCollected]),
    });
    doc.save(`تقرير_${selectedMonth}_${selectedYear}.pdf`);
    setExporting(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقفيل الشهر"
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
          <p className="text-sm text-slate-500 mb-1">تحصيل أول سنة</p>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(monthData.firstYearCollections)}</p>
        </div>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-1">تحصيل سنوات تالية</p>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(monthData.renewalCollections)}</p>
        </div>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
          <p className="text-sm text-slate-500 mb-1">الإجمالي العام</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(monthData.totalCollected)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={exportToExcel} disabled={exporting} className="px-4 py-2 bg-emerald-600 text-white rounded-xl flex items-center gap-2">
          <FileText className="w-4 h-4" /> Excel
        </button>
        <button onClick={exportToPDF} disabled={exporting} className="px-4 py-2 bg-rose-600 text-white rounded-xl flex items-center gap-2">
          <FileText className="w-4 h-4" /> PDF
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-slate-50 dark:bg-slate-900/50">
            <tr>
              <th className="px-6 py-4 text-sm font-bold">المندوب</th>
              <th className="px-6 py-4 text-sm font-bold">الجديد</th>
              <th className="px-6 py-4 text-sm font-bold">أول سنة</th>
              <th className="px-6 py-4 text-sm font-bold">سنوات تالية</th>
              <th className="px-6 py-4 text-sm font-bold">الإجمالي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {agentCollections.map(agent => (
              <tr key={agent.agentId}>
                <td className="px-6 py-4">{agent.agentName}</td>
                <td className="px-6 py-4 text-blue-600 font-bold">{formatCurrency(agent.newBusiness)}</td>
                <td className="px-6 py-4 text-emerald-600 font-bold">{formatCurrency(agent.firstYearCollections)}</td>
                <td className="px-6 py-4 text-purple-600 font-bold">{formatCurrency(agent.renewalCollections)}</td>
                <td className="px-6 py-4 font-bold">{formatCurrency(agent.totalCollected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
