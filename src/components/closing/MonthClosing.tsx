import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatPercent, getMonthName, formatDate } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Calendar, Lock, FileText, Table2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface MonthData {
  newBusiness: number;
  collections: number;
  totalCollected: number;
  totalOverdue: number;
  newClients: number;
  newPolicies: number;
  collectionRate: number;
}

interface AgentCollection {
  agentId: string;
  agentName: string;
  newBusiness: number;
  collections: number;
  totalCollected: number;
  count: number;
}

interface BranchSummary {
  branchId: string;
  branchName: string;
  newBusiness: number;
  collections: number;
  totalCollected: number;
  agents: AgentCollection[];
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
    totalCollected: 0,
    totalOverdue: 0,
    newClients: 0,
    newPolicies: 0,
    collectionRate: 0,
  });
  const [isCurrentClosed, setIsCurrentClosed] = useState(false);
  const [agentCollections, setAgentCollections] = useState<AgentCollection[]>([]);
  const [branchSummary, setBranchSummary] = useState<BranchSummary[]>([]);

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const [policiesRes, collectionsRes, clientsRes, installmentsRes, closingsRes, agentCollectionsRes] =
        await Promise.all([
          supabase
            .from('policies')
            .select('annual_premium, created_at')
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd),
          supabase
            .from('collections')
            .select('amount, is_new_business')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd),
          supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd),
          supabase
            .from('installments')
            .select('amount, status, due_date')
            .gte('due_date', monthStart)
            .lt('due_date', monthEnd),
          supabase.from('month_closings').select('month, year'),
          supabase
            .from('collections')
            .select('*, policy:policies(agent_id, branch_id), collector:profiles(full_name, manager_id)')
            .gte('collection_date', monthStart)
            .lt('collection_date', monthEnd),
        ]);

      const policies = policiesRes.data || [];
      const collections = collectionsRes.data || [];
      const installments = installmentsRes.data || [];

      // Calculate new business and collections
      const newBusiness = collections.filter(c => c.is_new_business).reduce((s, c) => s + Number(c.amount), 0);
      const collectionsTotal = collections.filter(c => !c.is_new_business).reduce((s, c) => s + Number(c.amount), 0);
      const totalCollected = collections.reduce((s, c) => s + Number(c.amount), 0);
      const totalRequired = installments.reduce((s, i) => s + Number(i.amount), 0);
      const totalOverdue = installments.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0);

      setMonthData({
        newBusiness,
        collections: collectionsTotal,
        totalCollected,
        totalOverdue,
        newClients: clientsRes.count || 0,
        newPolicies: policies.length,
        collectionRate: totalRequired > 0 ? (totalCollected / totalRequired) * 100 : 0,
      });

      // Process agent collections
      const agentMap = new Map<string, { name: string; newBusiness: number; collections: number; total: number; count: number }>();
      if (agentCollectionsRes.data) {
        for (const col of agentCollectionsRes.data as any[]) {
          const agentId = col.policy?.agent_id;
          if (agentId) {
            const existing = agentMap.get(agentId) || { name: '', newBusiness: 0, collections: 0, total: 0, count: 0 };
            const amount = Number(col.amount);
            const isNewBusiness = col.is_new_business;

            agentMap.set(agentId, {
              name: col.collector?.full_name || 'Unknown',
              newBusiness: existing.newBusiness + (isNewBusiness ? amount : 0),
              collections: existing.collections + (!isNewBusiness ? amount : 0),
              total: existing.total + amount,
              count: existing.count + 1,
            });
          }
        }
      }

      const agentCollectionsArray = Array.from(agentMap.entries()).map(([agentId, data]) => ({
        agentId,
        agentName: data.name,
        newBusiness: data.newBusiness,
        collections: data.collections,
        totalCollected: data.total,
        count: data.count,
      }));

      setAgentCollections(agentCollectionsArray);

      // Check if current month is closed
      const isClosed = closingsRes.data?.some(c => c.month === selectedMonth && c.year === selectedYear);
      setIsCurrentClosed(isClosed || false);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }

  async function closeMonth() {
    if (!confirm(`هل أنت متأكد من تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}؟ لن تتمكن من تعديل البيانات بعد ذلك.`)) {
      return;
    }

    try {
      const { error } = await supabase.from('month_closings').insert({
        month: selectedMonth,
        year: selectedYear,
        closed_by: profile?.id,
        closed_at: new Date().toISOString(),
      });

      if (error) {
        toast.error('خطأ في تقفيل الشهر: ' + error.message);
        return;
      }

      toast.success('✅ تم تقفيل الشهر بنجاح');
      setIsCurrentClosed(true);
    } catch (error) {
      console.error('Error closing month:', error);
      toast.error('حدث خطأ غير متوقع');
    }
  }

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const ws = XLSX.utils.json_to_sheet(
        agentCollections.map(a => ({
          'اسم المندوب': a.agentName,
          'الإنتاج الجديد': a.newBusiness,
          'التحصيلات': a.collections,
          'الإجمالي': a.totalCollected,
          'عدد التحصيلات': a.count,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'تقرير الشهر');
      XLSX.writeFile(wb, `تقرير_${getMonthName(selectedMonth)}_${selectedYear}.xlsx`);
      toast.success('تم تصدير الملف بنجاح');
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('خطأ في التصدير');
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      doc.text(`تقرير تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}`, 10, 10);

      const summaryData = [
        ['الإنتاج الجديد', formatCurrency(monthData.newBusiness)],
        ['التحصيلات', formatCurrency(monthData.collections)],
        ['الإجمالي المحصل', formatCurrency(monthData.totalCollected)],
        ['معدل التحصيل', formatPercent(monthData.collectionRate)],
      ];

      (doc as any).autoTable({
        head: [['البيان', 'القيمة']],
        body: summaryData,
        startY: 20,
      });

      (doc as any).autoTable({
        head: [['المندوب', 'الإنتاج الجديد', 'التحصيلات', 'الإجمالي']],
        body: agentCollections.map(a => [
          a.agentName,
          formatCurrency(a.newBusiness),
          formatCurrency(a.collections),
          formatCurrency(a.totalCollected),
        ]),
        startY: (doc as any).lastAutoTable.finalY + 10,
      });

      doc.save(`تقرير_${getMonthName(selectedMonth)}_${selectedYear}.pdf`);
      toast.success('تم تصدير الملف بنجاح');
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('خطأ في التصدير');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="تقفيل الشهر"
        description={`${getMonthName(selectedMonth)} ${selectedYear}`}
        icon={Calendar}
        actions={
          !isCurrentClosed && (
            <button
              onClick={closeMonth}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              تقفيل الشهر
            </button>
          )
        }
      />

      {/* Month Selection */}
      <div className="flex gap-4 mb-6">
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(Number(e.target.value))}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {getMonthName(i + 1)}
            </option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <option key={i} value={new Date().getFullYear() - i}>
              {new Date().getFullYear() - i}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">الإنتاج الجديد</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {formatCurrency(monthData.newBusiness)}
          </p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">التحصيلات</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(monthData.collections)}
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">معدل التحصيل</p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {formatPercent(monthData.collectionRate)}
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
          <p className="text-sm text-slate-600 dark:text-slate-400">المتأخر</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(monthData.totalOverdue)}
          </p>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={exportToExcel}
          disabled={exporting}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          تصدير Excel
        </button>
        <button
          onClick={exportToPDF}
          disabled={exporting}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          تصدير PDF
        </button>
      </div>

      {/* Agent Collections Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  اسم المندوب
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  الإنتاج الجديد
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  التحصيلات
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  الإجمالي
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  عدد التحصيلات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {agentCollections.map(agent => (
                <tr key={agent.agentId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-3 text-sm text-slate-900 dark:text-white">{agent.agentName}</td>
                  <td className="px-6 py-3 text-sm text-blue-600 dark:text-blue-400 font-medium">
                    {formatCurrency(agent.newBusiness)}
                  </td>
                  <td className="px-6 py-3 text-sm text-green-600 dark:text-green-400 font-medium">
                    {formatCurrency(agent.collections)}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-900 dark:text-white font-bold">
                    {formatCurrency(agent.totalCollected)}
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600 dark:text-slate-400">{agent.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCurrentClosed && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-700 dark:text-green-400 font-medium">✅ تم تقفيل هذا الشهر</p>
        </div>
      )}
    </div>
  );
}
