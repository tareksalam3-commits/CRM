import React, { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Users, DollarSign, Calendar, PieChart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { formatCurrency, formatPercent, formatDate } from '../../lib/utils';

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
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      // Base query for all reports - restricted to first year only
      const baseQuery = supabase
        .from('unified_performance_metrics')
        .select(`
          amount,
          collection_date,
          is_new_business,
          is_first_year_collection,
          policy_id,
          agent_id,
          collector:profiles!collections_collected_by_fkey(full_name),
          branch:branches(name)
        `)
        .gte('collection_date', startDate)
        .lt('collection_date', endDate)
        .eq('is_first_year_collection', true);

      const { data, error } = await baseQuery;
      if (error) throw error;

      switch (activeReport) {
        case 'new-business':
          const newBusinessItems = data.filter(m => m.is_new_business);
          setReportData({
            type: 'تقرير الإنتاج الجديد (السنة الأولى)',
            items: newBusinessItems,
            total: newBusinessItems.reduce((sum, m) => sum + Number(m.amount), 0)
          });
          break;
        case 'collections':
          const collectionItems = data.filter(m => !m.is_new_business);
          setReportData({
            type: 'تقرير التحصيلات (السنة الأولى)',
            items: collectionItems,
            total: collectionItems.reduce((sum, m) => sum + Number(m.amount), 0)
          });
          break;
        case 'monthly-closing':
          const nb = data.filter(m => m.is_new_business).reduce((sum, m) => sum + Number(m.amount), 0);
          const coll = data.filter(m => !m.is_new_business).reduce((sum, m) => sum + Number(m.amount), 0);
          setReportData({
            type: 'ملخص تقفيل الشهر (السنة الأولى)',
            newBusiness: nb,
            collections: coll,
            total: nb + coll,
            clientsCount: new Set(data.map(m => m.policy_id)).size
          });
          break;
        case 'agent-performance':
          const agentMap: Record<string, any> = {};
          data.forEach(m => {
            const name = (m.collector as any)?.full_name || 'غير معروف';
            if (!agentMap[name]) agentMap[name] = { name, newBusiness: 0, collections: 0, total: 0 };
            if (m.is_new_business) agentMap[name].newBusiness += Number(m.amount);
            else agentMap[name].collections += Number(m.amount);
            agentMap[name].total += Number(m.amount);
          });
          setReportData({
            type: 'تقرير أداء الوكلاء (السنة الأولى)',
            agents: Object.values(agentMap)
          });
          break;
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [activeReport, selectedMonth, selectedYear]);

  const exportToExcel = () => {
    if (!reportData) return;
    let dataToExport = [];
    if (reportData.items) dataToExport = reportData.items.map((i: any) => ({
      'التاريخ': formatDate(i.collection_date),
      'المحصل': i.collector?.full_name,
      'الفرع': i.branch?.name,
      'القيمة': i.amount
    }));
    else if (reportData.agents) dataToExport = reportData.agents;
    else dataToExport = [reportData];

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${reportData.type}_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const exportToPDF = () => {
    const element = document.getElementById('report-content');
    if (element) {
      html2pdf().set({ margin: 10, filename: `${reportData.type}_${selectedMonth}_${selectedYear}.pdf` }).from(element).save();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="w-8 h-8 text-blue-600" />
          التقارير والإحصائيات (السنة الأولى فقط)
        </h1>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="px-4 py-2 bg-emerald-600 text-white rounded-xl flex items-center gap-2">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportToPDF} className="px-4 py-2 bg-rose-600 text-white rounded-xl flex items-center gap-2">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center">
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto">
          {[
            { id: 'new-business', label: 'الإنتاج الجديد', icon: TrendingUp },
            { id: 'collections', label: 'التحصيلات', icon: DollarSign },
            { id: 'monthly-closing', label: 'تقفيل الشهر', icon: Calendar },
            { id: 'agent-performance', label: 'أداء الوكلاء', icon: Users },
          ].map((report) => (
            <button
              key={report.id}
              onClick={() => setActiveReport(report.id)}
              className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap ${
                activeReport === report.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <report.icon className="w-4 h-4" />
              {report.label}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 ml-auto">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('ar-EG', { month: 'long' })}</option>
            ))}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            {Array.from({ length: 5 }, (_, i) => (
              <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>
            ))}
          </select>
        </div>
      </div>

      <div id="report-content" className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-8">
        {loading ? (
          <div className="p-20 text-center">جاري التحميل...</div>
        ) : reportData ? (
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-bold">{reportData.type}</h2>
              <p className="text-slate-500">لشهر {selectedMonth} سنة {selectedYear}</p>
            </div>

            {activeReport === 'monthly-closing' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-xs text-blue-600 font-bold mb-1">الإنتاج الجديد</p>
                  <p className="text-xl font-bold">{formatCurrency(reportData.newBusiness)}</p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-bold mb-1">التحصيلات</p>
                  <p className="text-xl font-bold">{formatCurrency(reportData.collections)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-600 font-bold mb-1">إجمالي المحقق</p>
                  <p className="text-xl font-bold">{formatCurrency(reportData.total)}</p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-slate-50">
                  <tr>
                    {activeReport === 'agent-performance' ? (
                      <>
                        <th className="px-4 py-2">الوكيل</th>
                        <th className="px-4 py-2">الجديد</th>
                        <th className="px-4 py-2">التحصيل</th>
                        <th className="px-4 py-2">الإجمالي</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-2">التاريخ</th>
                        <th className="px-4 py-2">المحصل</th>
                        <th className="px-4 py-2">الفرع</th>
                        <th className="px-4 py-2">القيمة</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activeReport === 'agent-performance' ? (
                    reportData.agents?.map((a: any, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{a.name}</td>
                        <td className="px-4 py-2">{formatCurrency(a.newBusiness)}</td>
                        <td className="px-4 py-2">{formatCurrency(a.collections)}</td>
                        <td className="px-4 py-2 font-bold">{formatCurrency(a.total)}</td>
                      </tr>
                    ))
                  ) : (
                    reportData.items?.map((item: any, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{formatDate(item.collection_date)}</td>
                        <td className="px-4 py-2">{item.collector?.full_name}</td>
                        <td className="px-4 py-2">{item.branch?.name}</td>
                        <td className="px-4 py-2 font-bold">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
