import React, { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { calculateAgentPerformance, getAllAgentsPerformance } from '../../services/reportsService';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';

interface ReportData {
  type: string;
  month: number;
  year: number;
  data: any;
  generatedAt: string;
}

interface PerformanceMetrics {
  newBusiness: number;
  collections: number;
  newClients: number;
  paidInstallments: number;
  collectionRate: number;
}

export default function ComprehensiveReports() {
  const { profile } = useAuth();
  const [activeReport, setActiveReport] = useState<string>('new-business');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [bottomPerformers, setBottomPerformers] = useState<any[]>([]);

  // Fetch report data based on selected report type
  const fetchReportData = async () => {
    setLoading(true);
    try {
      switch (activeReport) {
        case 'new-business':
          await fetchNewBusinessReport();
          break;
        case 'collections':
          await fetchCollectionsReport();
          break;
        case 'monthly-closing':
          await fetchMonthlyClosingReport();
          break;
        case 'branch-performance':
          await fetchBranchPerformanceReport();
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

  /**
   * New Business Report - Collections where is_new_business = true
   */
  const fetchNewBusinessReport = async () => {
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('unified_performance_metrics')
      .select(`
        collection_id,
        amount,
        collection_date,
        is_new_business,
        policy_id,
        agent_id,
        collector:profiles!collections_collected_by_fkey(full_name, email)
      `)
      .eq('is_new_business', true)
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd)
      .order('collection_date', { ascending: false });

    if (!error && data) {
      const totalNewBusiness = data.reduce((sum: number, c: any) => sum + Number(c.amount), 0);

      setReportData({
        type: 'New Business Report',
        month: selectedMonth,
        year: selectedYear,
        totalNewBusiness,
        collections: data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  /**
   * Collections Report - Collections where is_new_business = false
   */
  const fetchCollectionsReport = async () => {
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const { data, error } = await supabase
      .from('unified_performance_metrics')
      .select(`
        collection_id,
        amount,
        collection_date,
        is_new_business,
        is_first_year_collection,
        agent_id,
        collector:profiles!collections_collected_by_fkey(full_name, email)
      `)
      .eq('is_new_business', false)
      .eq('is_first_year_collection', true)
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd)
      .order('collection_date', { ascending: false });

    if (!error && data) {
      const totalCollections = data.reduce((sum: number, c: any) => sum + Number(c.amount), 0);

      setReportData({
        type: 'Collections Report',
        month: selectedMonth,
        year: selectedYear,
        totalCollections,
        collections: data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  /**
   * Monthly Closing Report
   */
  const fetchMonthlyClosingReport = async () => {
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    // Get all collections for the month using unified metrics
    const { data: metrics } = await supabase
      .from('unified_performance_metrics')
      .select('amount, is_new_business, is_first_year_collection')
      .gte('collection_date', monthStart)
      .lt('collection_date', monthEnd);

    // Get all installments due this month (first year only)
    const { data: installments } = await supabase
      .from('installments')
      .select('amount, due_date, policy:policies(first_year_end)')
      .gte('due_date', monthStart)
      .lt('due_date', monthEnd);

    const newBusiness = metrics
      ?.filter(m => m.is_new_business)
      .reduce((sum, m) => sum + Number(m.amount), 0) || 0;

    const collectionsTotal = metrics
      ?.filter(m => !m.is_new_business && m.is_first_year_collection)
      .reduce((sum, m) => sum + Number(m.amount), 0) || 0;

    const totalDue = installments
      ?.filter(i => i.due_date <= (i.policy?.first_year_end || '9999-12-31'))
      .reduce((sum, i) => sum + Number(i.amount), 0) || 0;
      
    const totalPaid = newBusiness + collectionsTotal;

    setReportData({
      type: 'Monthly Closing Report',
      month: selectedMonth,
      year: selectedYear,
      newBusiness,
      collections: collectionsTotal,
      totalDue,
      totalPaid,
      collectionRate: totalDue > 0 ? (totalPaid / totalDue) * 100 : 0,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  /**
   * Branch Performance Report
   */
  const fetchBranchPerformanceReport = async () => {
    const { data: branches } = await supabase
      .from('branches')
      .select('id, name')
      .eq('is_active', true);

    if (!branches) return;

    const branchPerformance = await Promise.all(
      branches.map(async (branch) => {
        const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
        const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
        const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
        const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const { data: collections } = await supabase
          .from('collections')
          .select('amount, is_new_business, policy:policies(branch_id)')
          .eq('policy.branch_id', branch.id)
          .gte('collection_date', monthStart)
          .lt('collection_date', monthEnd);

        const newBusiness = collections
          ?.filter(c => c.is_new_business)
          .reduce((sum, c) => sum + Number(c.amount), 0) || 0;

        const collectionsTotal = collections
          ?.filter(c => !c.is_new_business)
          .reduce((sum, c) => sum + Number(c.amount), 0) || 0;

        return {
          branch_name: branch.name,
          new_business: newBusiness,
          collections: collectionsTotal,
          total: newBusiness + collectionsTotal,
        };
      })
    );

    setReportData({
      type: 'Branch Performance Report',
      month: selectedMonth,
      year: selectedYear,
      branches: branchPerformance,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  /**
   * Agent Performance Report
   */
  const fetchAgentPerformanceReport = async () => {
    const result = await getAllAgentsPerformance(selectedMonth, selectedYear);

    if (result.success && result.data) {
      const sorted = result.data.sort((a, b) => b.total - a.total);

      setReportData({
        type: 'Agent Performance Report',
        month: selectedMonth,
        year: selectedYear,
        agents: sorted,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });

      setTopPerformers(sorted.slice(0, 5));
      setBottomPerformers(sorted.slice(-5).reverse());
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeReport, selectedMonth, selectedYear]);

  // Export to Excel
  const exportToExcel = () => {
    if (!reportData) return;

    const ws = XLSX.utils.json_to_sheet(reportData.collections || reportData.agents || reportData.branches || []);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${reportData.type}_${selectedMonth}_${selectedYear}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    if (!reportData) return;

    const element = document.getElementById('report-content');
    if (element) {
      html2pdf().set({ margin: 10, filename: `${reportData.type}_${selectedMonth}_${selectedYear}.pdf` }).from(element).save();
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">التقارير الشاملة</h1>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            تصدير Excel
          </button>
          <button
            onClick={exportToPDF}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            تصدير PDF
          </button>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
        {[
          { id: 'new-business', label: 'الإنتاج الجديد' },
          { id: 'collections', label: 'التحصيلات' },
          { id: 'monthly-closing', label: 'تقفيل الشهر' },
          { id: 'branch-performance', label: 'أداء الفروع' },
          { id: 'agent-performance', label: 'أداء المندوبين' },
        ].map((report) => (
          <button
            key={report.id}
            onClick={() => setActiveReport(report.id)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeReport === report.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {report.label}
          </button>
        ))}
      </div>

      {/* Month and Year Selection */}
      <div className="flex gap-4 mb-6">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(Number(e.target.value))}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
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
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <option key={i} value={new Date().getFullYear() - i}>
              {new Date().getFullYear() - i}
            </option>
          ))}
        </select>
      </div>

      {/* Report Content */}
      <div id="report-content" className="bg-white dark:bg-slate-800 rounded-lg p-6">
        {loading ? (
          <div className="text-center py-12">جاري التحميل...</div>
        ) : reportData ? (
          <div>
            <h2 className="text-xl font-bold mb-4">{reportData.type}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">تم التوليد: {reportData.generatedAt}</p>

            {/* Summary Stats */}
            {reportData.totalNewBusiness !== undefined && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400">الإنتاج الجديد</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {reportData.totalNewBusiness?.toLocaleString('ar-EG')}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400">عملاء جدد</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{reportData.newClientsCount || 0}</p>
                </div>
              </div>
            )}

            {/* Collections Table */}
            {reportData.collections && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-700">
                    <tr>
                      <th className="px-4 py-2 text-right">رقم الوثيقة</th>
                      <th className="px-4 py-2 text-right">المبلغ</th>
                      <th className="px-4 py-2 text-right">التاريخ</th>
                      <th className="px-4 py-2 text-right">النوع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.collections.map((c: any, i: number) => (
                      <tr key={i} className="border-b border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-2">{c.policy?.policy_number}</td>
                        <td className="px-4 py-2">{Number(c.amount).toLocaleString('ar-EG')}</td>
                        <td className="px-4 py-2">{new Date(c.collection_date).toLocaleDateString('ar-EG')}</td>
                        <td className="px-4 py-2">{c.is_new_business ? 'إنتاج جديد' : 'تحصيل'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Agents Table */}
            {reportData.agents && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-700">
                    <tr>
                      <th className="px-4 py-2 text-right">المندوب</th>
                      <th className="px-4 py-2 text-right">الإنتاج الجديد</th>
                      <th className="px-4 py-2 text-right">التحصيلات</th>
                      <th className="px-4 py-2 text-right">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.agents.map((a: any, i: number) => (
                      <tr key={i} className="border-b border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-2">{a.agent_name}</td>
                        <td className="px-4 py-2">{Number(a.new_business).toLocaleString('ar-EG')}</td>
                        <td className="px-4 py-2">{Number(a.collections).toLocaleString('ar-EG')}</td>
                        <td className="px-4 py-2 font-bold">{Number(a.total).toLocaleString('ar-EG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">لا توجد بيانات</div>
        )}
      </div>
    </div>
  );
}
