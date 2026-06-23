import React, { useState, useEffect } from 'react';
import { Download, Lock, FileText, Users, TrendingUp, DollarSign, Target, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import * as XLSX from 'xlsx';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { formatCurrency, formatPercent, formatDate } from '../../lib/utils';

interface ClosingData {
  month: number;
  year: number;
  summary: {
    generalSupervisor: { name: string; total: number };
    supervisors: { name: string; total: number }[];
    groupLeaders: { name: string; total: number }[];
    agents: { name: string; total: number }[];
    target: number;
    achieved: number;
    achievementRate: number;
    newBusiness: number;
    collections: number;
  };
  operations: any[];
  totals: {
    newBusiness: number;
    collections: number;
    clientsCount: number;
    policiesCount: number;
    paidInstallmentsCount: number;
  };
}

export default function EnhancedMonthClosing() {
  const { user, profile } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [closingData, setClosingData] = useState<ClosingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const canCloseMonth = ['super_admin', 'dev_manager'].includes(profile?.role || '');

  const calculateClosingData = async () => {
    setLoading(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      // 1. Fetch all valid first-year collections for the selected period
      const { data: metrics, error: metricsError } = await supabase
        .from('unified_performance_metrics')
        .select(`
          amount,
          collection_date,
          is_new_business,
          is_first_year_collection,
          policy_id,
          agent_id,
          policies!inner (
            policy_number,
            client:clients (name),
            branch:branches (name),
            agent:profiles!policies_agent_id_fkey (full_name),
            team_leader:profiles!policies_team_leader_id_fkey (full_name),
            supervisor:profiles!policies_supervisor_id_fkey (full_name),
            branch_manager:profiles!policies_branch_manager_id_fkey (full_name)
          )
        `)
        .gte('collection_date', startDate)
        .lt('collection_date', endDate)
        .eq('is_first_year_collection', true);


      if (metricsError) throw metricsError;

      // 2. Fetch Targets
      const { data: targets } = await supabase
        .from('targets')
        .select('target_amount')
        .eq('period_number', selectedMonth)
        .eq('year', selectedYear)
        .eq('period_type', 'monthly');

      const totalTarget = targets?.reduce((sum, t) => sum + Number(t.target_amount), 0) || 0;

      // 3. Process Operations
      const operations = (metrics || []).map((m: any) => ({
        policyNumber: m.policies.policy_number,
        clientName: m.policies.client?.name || 'غير معروف',
        branchName: m.policies.branch?.name || 'غير معروف',
        agentName: m.policies.agent?.full_name || 'غير معروف',
        teamLeaderName: m.policies.team_leader?.full_name || 'غير معروف',
        supervisorName: m.policies.supervisor?.full_name || 'غير معروف',
        type: m.is_new_business ? 'جديد' : 'تحصيل',
        amount: Number(m.amount),
        date: m.collection_date
      }));

      // 4. Calculate Summaries
      const summaryMap = {
        supervisors: {} as Record<string, number>,
        groupLeaders: {} as Record<string, number>,
        agents: {} as Record<string, number>,
        newBusiness: 0,
        collections: 0
      };

      metrics?.forEach((m: any) => {
        const amount = Number(m.amount);
        const p = m.policies;
        
        if (m.is_new_business) summaryMap.newBusiness += amount;
        else summaryMap.collections += amount;

        if (p.supervisor?.full_name) {
          summaryMap.supervisors[p.supervisor.full_name] = (summaryMap.supervisors[p.supervisor.full_name] || 0) + amount;
        }
        if (p.team_leader?.full_name) {
          summaryMap.groupLeaders[p.team_leader.full_name] = (summaryMap.groupLeaders[p.team_leader.full_name] || 0) + amount;
        }
        if (p.agent?.full_name) {
          summaryMap.agents[p.agent.full_name] = (summaryMap.agents[p.agent.full_name] || 0) + amount;
        }
      });

      const totalAchieved = summaryMap.newBusiness + summaryMap.collections;

      // 5. Final State
      setClosingData({
        month: selectedMonth,
        year: selectedYear,
        summary: {
          generalSupervisor: { name: 'المشرف العام', total: totalAchieved },
          supervisors: Object.entries(summaryMap.supervisors).map(([name, total]) => ({ name, total })),
          groupLeaders: Object.entries(summaryMap.groupLeaders).map(([name, total]) => ({ name, total })),
          agents: Object.entries(summaryMap.agents).map(([name, total]) => ({ name, total })),
          target: totalTarget,
          achieved: totalAchieved,
          achievementRate: totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0,
          newBusiness: summaryMap.newBusiness,
          collections: summaryMap.collections
        },
        operations,
        totals: {
          newBusiness: summaryMap.newBusiness,
          collections: summaryMap.collections,
          clientsCount: new Set(metrics?.map(m => m.policies.client?.name)).size,
          policiesCount: new Set(metrics?.map(m => m.policy_id)).size,
          paidInstallmentsCount: metrics?.length || 0
        }
      });

      // Check lock status
      const { data: lockInfo } = await supabase
        .from('month_closings')
        .select('is_locked')
        .eq('month', selectedMonth)
        .eq('year', selectedYear)
        .maybeSingle();
      
      setIsLocked(!!lockInfo?.is_locked);

    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseMonth = async () => {
    if (!closingData || !canCloseMonth) return;
    try {
      const { error } = await supabase.from('month_closings').upsert({
        month: selectedMonth,
        year: selectedYear,
        closed_by: user?.id,
        closed_at: new Date().toISOString(),
        total_premiums: closingData.summary.newBusiness,
        total_collections: closingData.summary.collections,
        collection_rate: closingData.summary.achievementRate,
        is_locked: true
      }, { onConflict: 'month,year' });

      if (!error) {
        setIsLocked(true);
        setShowConfirm(false);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const exportToExcel = () => {
    if (!closingData) return;
    const wb = XLSX.utils.book_new();

    // 1. Summary Sheet
    const summaryRows = [
      ['الملخص الإداري', `شهر ${selectedMonth} - ${selectedYear}`],
      [],
      ['البيان', 'القيمة'],
      ['إجمالي المشرف العام', closingData.summary.generalSupervisor.total],
      ...closingData.summary.supervisors.map(s => [`إجمالي المراقب: ${s.name}`, s.total]),
      ...closingData.summary.groupLeaders.map(g => [`إجمالي رئيس المجموعة: ${g.name}`, g.total]),
      ...closingData.summary.agents.map(a => [`إجمالي الوكيل: ${a.name}`, a.total]),
      [],
      ['الهدف', closingData.summary.target],
      ['المحقق', closingData.summary.achieved],
      ['نسبة الإنجاز', `${closingData.summary.achievementRate.toFixed(2)}%`],
      ['الجديد', closingData.summary.newBusiness],
      ['التحصيل', closingData.summary.collections]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'الملخص الإداري');

    // 2. Operations Sheet
    const opRows = [
      ['رقم الوثيقة', 'اسم العميل', 'الفرع', 'الوكيل', 'رئيس المجموعة', 'المراقب', 'النوع', 'القيمة', 'التاريخ'],
      ...closingData.operations.map(o => [
        o.policyNumber, o.clientName, o.branchName, o.agentName, o.teamLeaderName, o.supervisorName, o.type, o.amount, o.date
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opRows), 'تفاصيل العمليات');

    // 3. Totals Sheet
    const totalRows = [
      ['البيان', 'القيمة'],
      ['إجمالي الجديد', closingData.totals.newBusiness],
      ['إجمالي التحصيل', closingData.totals.collections],
      ['إجمالي عدد العملاء', closingData.totals.clientsCount],
      ['إجمالي عدد الوثائق', closingData.totals.policiesCount],
      ['إجمالي عدد الأقساط المسددة', closingData.totals.paidInstallmentsCount]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(totalRows), 'الإجماليات النهائية');

    XLSX.writeFile(wb, `تقفيل_الشهر_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const exportToPDF = () => {
    const element = document.getElementById('closing-report-content');
    if (!element) return;
    const opt = {
      margin: 10,
      filename: `تقفيل_الشهر_${selectedMonth}_${selectedYear}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    html2pdf().set(opt).from(element).save();
  };

  useEffect(() => {
    calculateClosingData();
  }, [selectedMonth, selectedYear]);

  return (
    <div className="space-y-6 p-4">
      {/* Control Panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">نظام تقفيل الشهر</h1>
              <p className="text-slate-500 text-sm">إدارة وإغلاق التقارير الشهرية للسنة الأولى فقط</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('ar-EG', { month: 'long' })}</option>
              ))}
            </select>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 5 }, (_, i) => (
                <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            {canCloseMonth && !isLocked && (
              <button onClick={() => setShowConfirm(true)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
                <Lock className="w-4 h-4" />
                تقفيل الشهر
              </button>
            )}
            <button onClick={exportToExcel} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors">
              <Download className="w-4 h-4" />
              Excel
            </button>
            <button onClick={exportToPDF} className="flex items-center gap-2 px-6 py-2 bg-rose-600 text-white rounded-xl hover:bg-rose-700 transition-colors">
              <Download className="w-4 h-4" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-500">جاري تحليل بيانات الشهر...</p>
        </div>
      ) : closingData ? (
        <div id="closing-report-content" className="space-y-8 bg-slate-50 p-6 rounded-3xl">
          {/* Header for PDF */}
          <div className="text-center space-y-2 mb-8 hidden print:block">
            <h1 className="text-3xl font-bold">تقرير تقفيل الشهر</h1>
            <p className="text-xl">شهر {selectedMonth} لسنة {selectedYear}</p>
            <div className="h-1 w-24 bg-blue-600 mx-auto rounded-full"></div>
          </div>

          {/* 1. Administrative Summary */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900">أولاً: الملخص الإداري</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SummaryCard title="إجمالي المشرف العام" value={formatCurrency(closingData.summary.generalSupervisor.total)} icon={Users} color="blue" />
              {closingData.summary.supervisors.map((s, i) => (
                <SummaryCard key={i} title={`إجمالي المراقب: ${s.name}`} value={formatCurrency(s.total)} icon={Users} color="indigo" />
              ))}
              {closingData.summary.groupLeaders.map((g, i) => (
                <SummaryCard key={i} title={`إجمالي رئيس المجموعة: ${g.name}`} value={formatCurrency(g.total)} icon={Users} color="slate" />
              ))}
              {closingData.summary.agents.map((a, i) => (
                <SummaryCard key={i} title={`إجمالي الوكيل: ${a.name}`} value={formatCurrency(a.total)} icon={Users} color="emerald" />
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <MetricBox title="الهدف" value={formatCurrency(closingData.summary.target)} />
              <MetricBox title="المحقق" value={formatCurrency(closingData.summary.achieved)} />
              <MetricBox title="نسبة الإنجاز" value={formatPercent(closingData.summary.achievementRate)} highlight />
              <MetricBox title="الجديد" value={formatCurrency(closingData.summary.newBusiness)} />
              <MetricBox title="التحصيل" value={formatCurrency(closingData.summary.collections)} />
            </div>
          </section>

          {/* 2. Operations Details */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900">ثانياً: تفاصيل العمليات</h2>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-right border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">رقم الوثيقة</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">العميل</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">الفرع</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">الوكيل</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">رئيس المجموعة</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">المراقب</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">النوع</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">القيمة</th>
                    <th className="px-4 py-3 text-sm font-bold text-slate-600">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {closingData.operations.map((op, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-blue-600">{op.policyNumber}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{op.clientName}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{op.branchName}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{op.agentName}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{op.teamLeaderName}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{op.supervisorName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${op.type === 'جديد' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                          {op.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900">{formatCurrency(op.amount)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDate(op.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Final Totals */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900">ثالثاً: الإجماليات النهائية</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <MetricBox title="إجمالي الجديد" value={formatCurrency(closingData.totals.newBusiness)} variant="outline" />
              <MetricBox title="إجمالي التحصيل" value={formatCurrency(closingData.totals.collections)} variant="outline" />
              <MetricBox title="إجمالي العملاء" value={closingData.totals.clientsCount.toString()} variant="outline" />
              <MetricBox title="إجمالي الوثائق" value={closingData.totals.policiesCount.toString()} variant="outline" />
              <MetricBox title="الأقساط المسددة" value={closingData.totals.paidInstallmentsCount.toString()} variant="outline" />
            </div>
          </section>
        </div>
      ) : null}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
              <Lock className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-2">تأكيد تقفيل الشهر</h3>
            <p className="text-slate-500 mb-8 leading-relaxed">
              هل أنت متأكد من تقفيل شهر {selectedMonth} لسنة {selectedYear}؟ 
              سيتم اعتماد الأرقام الحالية ومنع أي تعديلات مستقبلية على بيانات هذا الشهر.
            </p>
            <div className="flex gap-3">
              <button onClick={handleCloseMonth} className="flex-1 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all">
                تأكيد التقفيل
              </button>
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200'
  };
  return (
    <div className={`p-5 rounded-2xl border ${colors[color] || colors.blue} flex items-center justify-between`}>
      <div className="space-y-1">
        <p className="text-xs font-bold opacity-70 uppercase">{title}</p>
        <p className="text-xl font-black">{value}</p>
      </div>
      <Icon className="w-8 h-8 opacity-20" />
    </div>
  );
}

function MetricBox({ title, value, highlight, variant }: any) {
  if (variant === 'outline') {
    return (
      <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
        <p className="text-xs text-slate-500 font-bold mb-1">{title}</p>
        <p className="text-lg font-bold text-slate-900">{value}</p>
      </div>
    );
  }
  return (
    <div className={`p-4 rounded-2xl text-center ${highlight ? 'bg-blue-600 text-white' : 'bg-white border border-slate-100'}`}>
      <p className={`text-xs font-bold mb-1 ${highlight ? 'text-blue-100' : 'text-slate-500'}`}>{title}</p>
      <p className="text-lg font-black">{value}</p>
    </div>
  );
}
