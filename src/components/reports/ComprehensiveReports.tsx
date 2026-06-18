import React, { useState, useEffect } from 'react';
import { Download, FileText, TrendingUp, Users, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
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
  const { user } = useAuth();
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
        case 'group-leader-performance':
          await fetchGroupLeaderPerformanceReport();
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

  const fetchNewBusinessReport = async () => {
    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0);

    const { data, error } = await supabase
      .from('policies')
      .select(`
        id,
        policy_number,
        product,
        insurance_company,
        annual_premium,
        issue_date,
        agent:profiles(full_name, email),
        client:clients(name, phone)
      `)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    if (!error) {
      const totalNewBusiness = data?.reduce((sum: number, p: any) => sum + (p.annual_premium || 0), 0) || 0;
      const newClientsCount = new Set(data?.map((p: any) => p.client_id)).size;

      setReportData({
        type: 'New Business Report',
        month: selectedMonth,
        year: selectedYear,
        totalNewBusiness,
        newClientsCount,
        policies: data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  const fetchCollectionsReport = async () => {
    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0);

    const { data, error } = await supabase
      .from('collections')
      .select(`
        id,
        amount,
        collection_date,
        receipt_number,
        collected_by:profiles(full_name, email),
        installment:installments(installment_number),
        policy:policies(policy_number, product, agent:profiles(full_name))
      `)
      .gte('collection_date', startDate.toISOString().split('T')[0])
      .lte('collection_date', endDate.toISOString().split('T')[0])
      .order('collection_date', { ascending: false });

    if (!error) {
      const totalCollections = data?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;
      const collectionsCount = data?.length || 0;

      setReportData({
        type: 'Collections Report',
        month: selectedMonth,
        year: selectedYear,
        totalCollections,
        collectionsCount,
        collections: data,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  const fetchMonthlyClosingReport = async () => {
    const { data: closingData, error: closingError } = await supabase
      .from('month_closings')
      .select('*')
      .eq('month', selectedMonth)
      .eq('year', selectedYear)
      .single();

    if (!closingError && closingData) {
      const { data: detailedData } = await supabase
        .from('detailed_month_closing_data')
        .select('*')
        .eq('month_closing_id', closingData.id);

      setReportData({
        type: 'Monthly Closing Report',
        month: selectedMonth,
        year: selectedYear,
        ...closingData,
        detailedData,
        generatedAt: new Date().toLocaleString('ar-EG'),
      });
    }
  };

  const fetchBranchPerformanceReport = async () => {
    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0);

    const { data: agentsData } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'agent');

    const performanceData = await Promise.all(
      (agentsData || []).map(async (agent: any) => {
        const { data: policies } = await supabase
          .from('policies')
          .select('annual_premium')
          .eq('agent_id', agent.id)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());

        const { data: collections } = await supabase
          .from('collections')
          .select('amount')
          .eq('collected_by', agent.id)
          .gte('collection_date', startDate.toISOString().split('T')[0])
          .lte('collection_date', endDate.toISOString().split('T')[0]);

        const newBusiness = policies?.reduce((sum: number, p: any) => sum + (p.annual_premium || 0), 0) || 0;
        const totalCollections = collections?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;

        return {
          agentName: agent.full_name,
          newBusiness,
          collections: totalCollections,
          collectionRate: newBusiness > 0 ? ((totalCollections / newBusiness) * 100).toFixed(2) : 0,
        };
      })
    );

    setReportData({
      type: 'Branch Performance Report',
      month: selectedMonth,
      year: selectedYear,
      agentPerformance: performanceData,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  const fetchGroupLeaderPerformanceReport = async () => {
    const { data: groupLeaders } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'team_leader');

    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0);

    const performanceData = await Promise.all(
      (groupLeaders || []).map(async (leader: any) => {
        const { data: subordinates } = await supabase
          .from('profiles')
          .select('id')
          .eq('manager_id', leader.id);

        const subordinateIds = subordinates?.map((s: any) => s.id) || [];

        let totalNewBusiness = 0;
        let totalCollections = 0;

        for (const subId of subordinateIds) {
          const { data: policies } = await supabase
            .from('policies')
            .select('annual_premium')
            .eq('agent_id', subId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());

          const { data: collections } = await supabase
            .from('collections')
            .select('amount')
            .eq('collected_by', subId)
            .gte('collection_date', startDate.toISOString().split('T')[0])
            .lte('collection_date', endDate.toISOString().split('T')[0]);

          totalNewBusiness += policies?.reduce((sum: number, p: any) => sum + (p.annual_premium || 0), 0) || 0;
          totalCollections += collections?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;
        }

        return {
          leaderName: leader.full_name,
          teamSize: subordinateIds.length,
          newBusiness: totalNewBusiness,
          collections: totalCollections,
          collectionRate: totalNewBusiness > 0 ? ((totalCollections / totalNewBusiness) * 100).toFixed(2) : 0,
        };
      })
    );

    setReportData({
      type: 'Group Leader Performance Report',
      month: selectedMonth,
      year: selectedYear,
      leaderPerformance: performanceData,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  const fetchAgentPerformanceReport = async () => {
    const { data: agents } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'agent');

    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0);

    const performanceData = await Promise.all(
      (agents || []).map(async (agent: any) => {
        const { data: policies } = await supabase
          .from('policies')
          .select('id, annual_premium')
          .eq('agent_id', agent.id)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());

        const { data: collections } = await supabase
          .from('collections')
          .select('amount')
          .eq('collected_by', agent.id)
          .gte('collection_date', startDate.toISOString().split('T')[0])
          .lte('collection_date', endDate.toISOString().split('T')[0]);

        const { data: clients } = await supabase
          .from('clients')
          .select('id')
          .eq('agent_id', agent.id)
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString());

        const newBusiness = policies?.reduce((sum: number, p: any) => sum + (p.annual_premium || 0), 0) || 0;
        const totalCollections = collections?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;

        return {
          agentName: agent.full_name,
          policiesCount: policies?.length || 0,
          newBusiness,
          collections: totalCollections,
          newClientsCount: clients?.length || 0,
          collectionRate: newBusiness > 0 ? ((totalCollections / newBusiness) * 100).toFixed(2) : 0,
        };
      })
    );

    setReportData({
      type: 'Agent Performance Report',
      month: selectedMonth,
      year: selectedYear,
      agentPerformance: performanceData,
      generatedAt: new Date().toLocaleString('ar-EG'),
    });
  };

  // Export to Excel
  const exportToExcel = () => {
    if (!reportData) return;

    const workbook = XLSX.utils.book_new();
    let worksheet;

    if (activeReport === 'new-business' && reportData.policies) {
      const wsData = [
        ['تقرير الأعمال الجديدة', `${reportData.month}/${reportData.year}`],
        ['رقم الوثيقة', 'المنتج', 'شركة التأمين', 'القسط السنوي', 'الوكيل', 'اسم العميل', 'تاريخ الإصدار'],
        ...reportData.policies.map((p: any) => [
          p.policy_number,
          p.product,
          p.insurance_company,
          p.annual_premium,
          p.agent?.full_name || '',
          p.client?.name || '',
          p.issue_date,
        ]),
        [],
        ['إجمالي الأعمال الجديدة', reportData.totalNewBusiness],
        ['عدد العملاء الجدد', reportData.newClientsCount],
      ];
      worksheet = XLSX.utils.aoa_to_sheet(wsData);
    } else if (activeReport === 'collections' && reportData.collections) {
      const wsData = [
        ['تقرير التحصيل', `${reportData.month}/${reportData.year}`],
        ['رقم الإيصال', 'المبلغ', 'تاريخ التحصيل', 'المحصل', 'رقم الوثيقة', 'رقم القسط'],
        ...reportData.collections.map((c: any) => [
          c.receipt_number || 'بدون',
          c.amount,
          c.collection_date,
          c.collected_by?.full_name || '',
          c.policy?.policy_number || '',
          c.installment?.installment_number || '',
        ]),
        [],
        ['إجمالي التحصيل', reportData.totalCollections],
        ['عدد التحصيلات', reportData.collectionsCount],
      ];
      worksheet = XLSX.utils.aoa_to_sheet(wsData);
    } else if (activeReport === 'agent-performance' && reportData.agentPerformance) {
      const wsData = [
        ['تقرير أداء الوكلاء', `${reportData.month}/${reportData.year}`],
        ['اسم الوكيل', 'عدد الوثائق', 'الأعمال الجديدة', 'التحصيل', 'عدد العملاء الجدد', 'نسبة التحصيل'],
        ...reportData.agentPerformance.map((a: any) => [
          a.agentName,
          a.policiesCount,
          a.newBusiness,
          a.collections,
          a.newClientsCount,
          `${a.collectionRate}%`,
        ]),
      ];
      worksheet = XLSX.utils.aoa_to_sheet(wsData);
    }

    if (worksheet) {
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
      XLSX.writeFile(workbook, `${reportData.type}_${selectedMonth}_${selectedYear}.xlsx`);
    }
  };

  // Export to PDF
  const exportToPDF = () => {
    if (!reportData) return;

    const element = document.getElementById('report-content');
    if (!element) return;

    const opt = {
      margin: 10,
      filename: `${reportData.type}_${selectedMonth}_${selectedYear}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
    };

    html2pdf().set(opt).from(element).save();
  };

  useEffect(() => {
    fetchReportData();
  }, [activeReport, selectedMonth, selectedYear]);

  const reportTypes = [
    { id: 'new-business', label: 'تقرير الأعمال الجديدة', icon: TrendingUp },
    { id: 'collections', label: 'تقرير التحصيل', icon: DollarSign },
    { id: 'monthly-closing', label: 'تقرير تقفيل الشهر', icon: Calendar },
    { id: 'branch-performance', label: 'تقرير أداء الفرع', icon: Users },
    { id: 'group-leader-performance', label: 'تقرير أداء قائد المجموعة', icon: Users },
    { id: 'agent-performance', label: 'تقرير أداء الوكيل', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">التقارير الشاملة</h1>
        
        {/* Report Type Selection */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
          {reportTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => setActiveReport(type.id)}
                className={`p-3 rounded-lg transition-all ${
                  activeReport === type.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Icon className="w-5 h-5 mx-auto mb-1" />
                <span className="text-xs font-medium">{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* Date Selection */}
        <div className="flex gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الشهر</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2024, i).toLocaleString('ar-EG', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">السنة</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            disabled={!reportData || loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            تصدير Excel
          </button>
          <button
            onClick={exportToPDF}
            disabled={!reportData || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            تصدير PDF
          </button>
        </div>
      </div>

      {/* Report Content */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-600">جاري تحميل التقرير...</p>
        </div>
      ) : reportData ? (
        <div id="report-content" className="bg-white rounded-lg shadow p-6">
          <div className="mb-6 border-b pb-4">
            <h2 className="text-2xl font-bold text-gray-900">{reportData.type}</h2>
            <p className="text-gray-600">الفترة: {reportData.month}/{reportData.year}</p>
            <p className="text-gray-500 text-sm">تم التوليد: {reportData.generatedAt}</p>
          </div>

          {/* Render based on report type */}
          {activeReport === 'new-business' && reportData.policies && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-gray-600 text-sm">إجمالي الأعمال الجديدة</p>
                  <p className="text-2xl font-bold text-blue-600">{reportData.totalNewBusiness.toLocaleString()}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-gray-600 text-sm">عدد العملاء الجدد</p>
                  <p className="text-2xl font-bold text-green-600">{reportData.newClientsCount}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-right">رقم الوثيقة</th>
                      <th className="px-4 py-2 text-right">المنتج</th>
                      <th className="px-4 py-2 text-right">القسط السنوي</th>
                      <th className="px-4 py-2 text-right">الوكيل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.policies.map((p: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="px-4 py-2">{p.policy_number}</td>
                        <td className="px-4 py-2">{p.product}</td>
                        <td className="px-4 py-2">{p.annual_premium.toLocaleString()}</td>
                        <td className="px-4 py-2">{p.agent?.full_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeReport === 'agent-performance' && reportData.agentPerformance && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-right">اسم الوكيل</th>
                    <th className="px-4 py-2 text-right">الأعمال الجديدة</th>
                    <th className="px-4 py-2 text-right">التحصيل</th>
                    <th className="px-4 py-2 text-right">نسبة التحصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.agentPerformance.map((a: any, idx: number) => (
                    <tr key={idx} className="border-b">
                      <td className="px-4 py-2">{a.agentName}</td>
                      <td className="px-4 py-2">{a.newBusiness.toLocaleString()}</td>
                      <td className="px-4 py-2">{a.collections.toLocaleString()}</td>
                      <td className="px-4 py-2">{a.collectionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
