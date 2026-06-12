import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency, formatPercent, getMonthName } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Calendar, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

interface MonthData {
  totalPremiums: number;
  totalRequired: number;
  totalCollected: number;
  totalOverdue: number;
  newClients: number;
  newPolicies: number;
  collectionRate: number;
}

export default function MonthClosing() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthData, setMonthData] = useState<MonthData>({ totalPremiums: 0, totalRequired: 0, totalCollected: 0, totalOverdue: 0, newClients: 0, newPolicies: 0, collectionRate: 0 });
  const [isCurrentClosed, setIsCurrentClosed] = useState(false);

  useEffect(() => { loadData(); }, [selectedMonth, selectedYear]);

  async function loadData() {
    setLoading(true);
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const [policiesRes, collectionsRes, clientsRes, installmentsRes, closingsRes] = await Promise.all([
      supabase.from('policies').select('annual_premium, created_at').gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('collections').select('amount').gte('collection_date', monthStart).lt('collection_date', monthEnd),
      supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).lt('created_at', monthEnd),
      supabase.from('installments').select('amount, status, due_date').gte('due_date', monthStart).lt('due_date', monthEnd),
      supabase.from('month_closings').select('month, year'),
    ]);

    const policies = policiesRes.data || [];
    const collections = collectionsRes.data || [];
    const installments = installmentsRes.data || [];

    const totalPremiums = policies.reduce((s, p) => s + Number(p.annual_premium), 0);
    const totalCollected = collections.reduce((s, c) => s + Number(c.amount), 0);
    const totalRequired = installments.reduce((s, i) => s + Number(i.amount), 0);
    const totalOverdue = installments.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0);

    setMonthData({
      totalPremiums,
      totalRequired,
      totalCollected,
      totalOverdue,
      newClients: clientsRes.count || 0,
      newPolicies: policies.length,
      collectionRate: totalRequired > 0 ? (totalCollected / totalRequired) * 100 : 0,
    });

    const closings = (closingsRes.data || []).map(c => ({ month: c.month, year: c.year }));
    setIsCurrentClosed(closings.some(c => c.month === selectedMonth && c.year === selectedYear));
    setLoading(false);
  }

  async function closeMonth() {
    if (!profile) return;
    if (!confirm(`هل أنت متأكد من تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}؟`)) return;

    const { error } = await supabase.from('month_closings').insert({
      closed_by: profile.id,
      month: selectedMonth,
      year: selectedYear,
      snapshot_data: monthData,
      is_locked: true,
    });

    if (error) { toast.error('خطأ في تقفيل الشهر'); return; }
    toast.success('تم تقفيل الشهر بنجاح');
    loadData();
  }

  const canClose = profile?.role === 'super_admin' || profile?.role === 'dev_manager';

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="تقفيل الشهر" description="ملخص وإغلاق الشهر" icon={Calendar} />

      {/* Month Selector */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
          ))}
        </select>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {isCurrentClosed && (
          <span className="flex items-center gap-1 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-sm font-medium">
            <Lock className="w-4 h-4" /> مقفل
          </span>
        )}
      </div>

      {/* Month Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'الأقساط الجديدة', value: formatCurrency(monthData.totalPremiums), color: 'blue' },
          { label: 'المطلوب تحصيله', value: formatCurrency(monthData.totalRequired), color: 'amber' },
          { label: 'المحصل', value: formatCurrency(monthData.totalCollected), color: 'emerald' },
          { label: 'المتأخرات', value: formatCurrency(monthData.totalOverdue), color: 'red' },
          { label: 'عملاء جدد', value: String(monthData.newClients), color: 'indigo' },
          { label: 'وثائق جديدة', value: String(monthData.newPolicies), color: 'cyan' },
          { label: 'نسبة التحصيل', value: formatPercent(monthData.collectionRate), color: 'teal' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Executive Summary */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 mb-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">الملخص التنفيذي</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(monthData.totalPremiums)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">إجمالي الإنتاج</p>
          </div>
          <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(monthData.totalCollected)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">إجمالي التحصيل</p>
          </div>
          <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatPercent(monthData.collectionRate)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">نسبة الإنجاز</p>
          </div>
        </div>
      </div>

      {/* Close Month Button */}
      {canClose && !isCurrentClosed && (
        <div className="text-center">
          <button
            onClick={closeMonth}
            className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium shadow-lg shadow-red-600/30 transition-all"
          >
            <Lock className="w-5 h-5" />
            تقفيل شهر {getMonthName(selectedMonth)} {selectedYear}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">سيتم قفل البيانات ومنع التعديل عليها</p>
        </div>
      )}
    </div>
  );
}
