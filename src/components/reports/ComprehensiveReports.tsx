import React, { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Users, DollarSign, Calendar, PieChart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getAllAgentsPerformance } from '../../services/reportsService';
import * as XLSX from 'xlsx';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { formatCurrency, formatPercent } from '../../lib/utils';

export default function ComprehensiveReports() {
  const { profile } = useAuth();
  const [activeReport, setActiveReport] = useState<string>('new-business');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      switch (activeReport) {
        case 'new-business':
          await fetchNewBusinessReport(monthStart, monthEnd);
          break;
        case 'collections':
          await fetchCollectionsReport(monthStart, monthEnd);
          break;
        case 'monthly-closing':
          await fetchMonthlyClosingReport(monthStart, monthEnd);
          break;
        case 'branch-performance':
          await fetchBranchPerformanceReport(monthStart, monthEnd);
          break;
        case 'agent-performance':
          await fetchAgentPerformanceReport();
          break;
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNewBusinessReport = async (monthStart: string, monthEnd: string) => {
    const { data, error } = await supabase
      .from('unified_performance_metrics')
      .select(`
        collection_id,
        amount,
        collection_date,
        collection_category,
        policy_id,
        agent_id,
        collector:profiles!collections_collected_by_fkey(full_name)
      `)
      .eq('collection_category', 'new')
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd)
      .order('collection_date', { ascending: false });

    if (!error && data) {
      const totalNewBusiness = data.reduce((sum: number, c: any) => sum + Number(c.amount), 0);
      setReportData({
        type: 'تقرير الإنتاج الجديد',
        month: selectedMonth,
        year: selectedYear,
        totalAmount: totalNewBusiness,
        items: data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  const fetchCollectionsReport = async (monthStart: string, monthEnd: string) => {
    const { data, error } = await supabase
      .from('unified_performance_metrics')
      .select(`
        collection_id,
        amount,
        collection_date,
        collection_category,
        agent_id,
        collector:profiles!collections_collected_by_fkey(full_name)
      `)
      .in('collection_category', ['first_year', 'renewal'])
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd)
      .order('collection_date', { ascending: false });

    if (!error && data) {
      const firstYearTotal = data.filter((c: any) => c.collection_category === 'first_year').reduce((sum: number, c: any) => sum + Number(c.amount), 0);
      const renewalTotal = data.filter((c: any) => c.collection_category === 'renewal').reduce((sum: number, c: any) => sum + Number(c.amount), 0);

      setReportData({
        type: 'تقرير التحصيلات',
        month: selectedMonth,
        year: selectedYear,
        firstYearTotal,
        renewalTotal,
        totalAmount: firstYearTotal + renewalTotal,
        items: data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  const fetchMonthlyClosingReport = async (monthStart: string, monthEnd: string) => {
    const { data: metrics } = await supabase
      .from('unified_performance_metrics')
      .select('amount, collection_category')
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd);

    const newBusiness = metrics?.filter(m => m.collection_category === 'new').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
    const firstYearCollections = metrics?.filter(m => m.collection_category === 'first_year').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
    const renewalCollections = metrics?.filter(m => m.collection_category === 'renewal').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
    const totalCollections = firstYearCollections + renewalCollections;

    setReportData({
      type: 'تقرير تقفيل الشهر',
      month: selectedMonth,
      year: selectedYear,
      newBusiness,
      firstYearCollections,
      renewalCollections,
      totalCollections,
      totalPaid: newBusiness + totalCollections,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  const fetchBranchPerformanceReport = async (monthStart: string, monthEnd: string) => {
    const { data: branches } = await supabase.from('branches').select('id, name').eq('is_active', true);
    if (!branches) return;

    const branchPerformance = await Promise.all(
      branches.map(async (branch) => {
        const { data: metrics } = await supabase
          .from('unified_performance_metrics')
          .select('amount, collection_category')
          .eq('branch_id', branch.id)
          .gte('collection_date', monthStart)
          .lt('collection_date', monthEnd);

        const newBusiness = metrics?.filter(m => m.collection_category === 'new').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
        const firstYear = metrics?.filter(m => m.collection_category === 'first_year').reduce((sum, m) => sum + Number(m.amount), 0) || 0;
        const renewals = metrics?.filter(m => m.collection_category === 'renewal').reduce((sum, m) => sum + Number(m.amount), 0) || 0;

        return {
          branch_name: branch.name,
          new_business: newBusiness,
          first_year: firstYear,
          renewals: renewals,
          total: newBusiness + firstYear + renewals,
        };
      })
    );

    setReportData({
      type: 'تقرير أداء الفروع',
      month: selectedMonth,
      year: selectedYear,
      branches: branchPerformance,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  const fetchAgentPerformanceReport = async () => {
    const result = await getAllAgentsPerformance(selectedMonth, selectedYear);
    if (result.success && result.data) {
      setReportData({
        type: 'تقرير أداء المندوبين',
        month: selectedMonth,
        year: selectedYear,
        agents: result.data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeReport, selectedMonth, selectedYear]);

  const exportToExcel = () => {
    if (!reportData) return;
    const dataToExport = reportData.items || reportData.agents || reportData.branches || [reportData];
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${reportData.type}_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const exportToPDF = () => {
    if (!reportData) return;
    const element = document.getElementById('report-content');
    if (element) {
      html2pdf().set({ margin: 10, filename: `${reportData.type}_${selectedMonth}_${selectedYear}.pdf` }).from(element).save();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="w-8 h-8 text-blue-600" />
          التقارير والإحصائيات
        </h1>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" />
            تصدير Excel
          </button>
          <button onClick={exportToPDF} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl flex items-center gap-2 transition-colors">
            <Download className="w-4 h-4" />
            تصدير PDF
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-wrap gap-4 items-center">
        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl overflow-x-auto">
          {[
            { id: 'new-business', label: 'الإنتاج الجديد', icon: TrendingUp },
            { id: 'collections', label: 'التحصيلات', icon: DollarSign },
            { id: 'monthly-closing', label: 'تقفيل الشهر', icon: Calendar },
            { id: 'branch-performance', label: 'أداء الفروع', icon: PieChart },
            { id: 'agent-performance', label: 'أداء المندوبين', icon: Users },
          ].map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReport(report.id)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap ${
                activeReport === report.id
                  ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <report.icon className="w-4 h-4" />
              {report.label}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 ml-auto">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString('ar-EG', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <option key={i} value={new Date().getFullYear() - i}>
                {new Date().getFullYear() - i}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div id="report-content" className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-20 text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500">جاري إعداد التقرير...</p>
          </div>
        ) : reportData ? (
          <div className="p-8">
            <div className="border-b border-slate-100 dark:border-slate-700 pb-6 mb-8 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{reportData.type}</h2>
                <p className="text-slate-500">لشهر {new Date(2000, reportData.month - 1).toLocaleString('ar-EG', { month: 'long' })} {reportData.year}</p>
              </div>
              <div className="text-left text-xs text-slate-400">
                تاريخ الاستخراج: {reportData.generatedAt}
              </div>
            </div>

            {/* Summary Cards */}
            {activeReport === 'monthly-closing' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase mb-1">الإنتاج الجديد</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(reportData.newBusiness)}</p>
                </div>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase mb-1">تحصيل أول سنة</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(reportData.firstYearCollections)}</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800/30">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-bold uppercase mb-1">تحصيل سنوات تالية</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(reportData.renewalCollections)}</p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800/30">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-bold uppercase mb-1">إجمالي المدفوع</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(reportData.totalPaid)}</p>
                </div>
              </div>
            )}

            {/* Data Tables */}
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50">
                    {activeReport === 'new-business' && (
                      <>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">التاريخ</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">المحصل</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400 text-left">المبلغ</th>
                      </>
                    )}
                    {activeReport === 'collections' && (
                      <>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">التاريخ</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">التصنيف</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">المحصل</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400 text-left">المبلغ</th>
                      </>
                    )}
                    {activeReport === 'branch-performance' && (
                      <>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">الفرع</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">الجديد</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">تحصيل أول سنة</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">تحصيل تالي</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400 text-left">الإجمالي</th>
                      </>
                    )}
                    {activeReport === 'agent-performance' && (
                      <>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">المندوب</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">الجديد</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">تحصيل أول سنة</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400">تحصيل تالي</th>
                        <th className="px-6 py-4 text-sm font-bold text-slate-600 dark:text-slate-400 text-left">نسبة الإنجاز</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {activeReport === 'new-business' && reportData.items?.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-6 py-4 text-sm">{item.collection_date}</td>
                      <td className="px-6 py-4 text-sm">{item.collector?.full_name}</td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-left">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                  {activeReport === 'collections' && reportData.items?.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-6 py-4 text-sm">{item.collection_date}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                          item.collection_category === 'first_year' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {item.collection_category === 'first_year' ? 'أول سنة' : 'سنوات تالية'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">{item.collector?.full_name}</td>
                      <td className="px-6 py-4 text-sm font-bold text-blue-600 text-left">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                  {activeReport === 'branch-performance' && reportData.branches?.map((branch: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold">{branch.branch_name}</td>
                      <td className="px-6 py-4 text-sm">{formatCurrency(branch.new_business)}</td>
                      <td className="px-6 py-4 text-sm">{formatCurrency(branch.first_year)}</td>
                      <td className="px-6 py-4 text-sm">{formatCurrency(branch.renewals)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-left">{formatCurrency(branch.total)}</td>
                    </tr>
                  ))}
                  {activeReport === 'agent-performance' && reportData.agents?.map((agent: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold">{agent.agent_name}</td>
                      <td className="px-6 py-4 text-sm">{formatCurrency(agent.new_business)}</td>
                      <td className="px-6 py-4 text-sm">{formatCurrency(agent.first_year_collections)}</td>
                      <td className="px-6 py-4 text-sm">{formatCurrency(agent.renewal_collections)}</td>
                      <td className="px-6 py-4 text-sm text-left">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="font-bold text-emerald-600">{formatPercent(agent.achievement_rate)}</span>
                          <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(agent.achievement_rate, 100)}%` }}></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-20 text-center text-slate-500 italic">اختر نوع التقرير والفترة لعرض البيانات</div>
        )}
      </div>
    </div>
  );
}
