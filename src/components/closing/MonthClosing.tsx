import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canCloseMonth } from '../../lib/rbac';
import { getBranchScope, getSubordinateIds } from '../../lib/dataAccess';
import { formatCurrency, formatPercent, getMonthName } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Calendar, Lock, FileText, Download, Target, TrendingUp, Wallet, Award, Building2, User, ShieldCheck } from 'lucide-react';
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
  supervisors?: Array<{ id: string; name: string; newBusiness: number; collections: number }>;
  teamLeaders?: Array<{ id: string; name: string; newBusiness: number; collections: number }>;
  target: number;
  achieved: number;
  achievementRate: number;
  newBusiness: number;
  collections: number;
}

export default function MonthClosing() {
  const { profile, activeBranch } = useAuth();
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
  const [metrics, setMetrics] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear, activeBranch, profile]);

  async function loadData() {
    if (!profile) return;
    setLoading(true);
    try {
      const scope = getBranchScope(profile, activeBranch);
      let subIds: string[] = [];
      if (scope.role === 'team_leader' || scope.role === 'supervisor') {
        subIds = await getSubordinateIds(scope.userId);
      }

      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      let metricsQuery = supabase
        .from('unified_performance_metrics')
        .select(`
          *,
          policy:policies(
            policy_number,
            client_id,
            agent_id,
            branch_id,
            team_leader_id,
            supervisor_id,
            client:clients(name),
            agent:profiles(full_name),
            team_leader:profiles!policies_team_leader_id_fkey(full_name),
            supervisor:profiles!policies_supervisor_id_fkey(full_name),
            branch:branches(name)
          )
        `)
        .gte('collection_date', monthStart)
        .lt('collection_date', monthEnd)
        .eq('is_first_year_collection', true);

      let targetsQuery = supabase
        .from('targets')
        .select('target_amount, user_id')
        .eq('period_type', 'monthly')
        .eq('period_number', selectedMonth)
        .eq('year', selectedYear);

      if (!scope.isAllBranches && scope.branchId) {
        metricsQuery = metricsQuery.eq('branch_id', scope.branchId);
      }

      if (scope.role === 'agent') {
        metricsQuery = metricsQuery.eq('agent_id', scope.userId);
        targetsQuery = targetsQuery.eq('user_id', scope.userId);
      } else if ((scope.role === 'team_leader' || scope.role === 'supervisor') && subIds.length > 0) {
        metricsQuery = metricsQuery.in('agent_id', subIds);
        const visibleIds = [scope.userId, ...subIds];
        targetsQuery = targetsQuery.in('user_id', visibleIds);
      } else if (scope.role === 'general_supervisor' && scope.branchId) {
        targetsQuery = targetsQuery.eq('branch_id', scope.branchId);
      }

      const [metricsRes, targetsRes, closingsRes] = await Promise.all([
        metricsQuery,
        targetsQuery,
        supabase.from('month_closings').select('month, year'),
      ]);

      const metrics = metricsRes.data || [];
      const targets = targetsRes.data || [];

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

      const agentMap = new Map<string, AgentCollection>();
      const supervisorMap = new Map<string, any>();
      const teamLeaderMap = new Map<string, any>();

      for (const m of metrics) {
        const policy = m.policy as any;
        if (!policy) continue;

        const amount = Number(m.amount);
        const isNew = m.is_new_business;

        const agentId = policy.agent_id;
        if (agentId) {
          if (!agentMap.has(agentId)) {
            agentMap.set(agentId, {
              agentId,
              agentName: policy.agent?.full_name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
              totalProduction: 0,
              count: 0,
            });
          }
          const agent = agentMap.get(agentId)!;
          if (isNew) agent.newBusiness += amount;
          else agent.collections += amount;
          agent.totalProduction += amount;
          agent.count += 1;
        }

        const tlId = policy.team_leader_id;
        if (tlId) {
          if (!teamLeaderMap.has(tlId)) {
            teamLeaderMap.set(tlId, {
              id: tlId,
              name: policy.team_leader?.full_name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
            });
          }
          const tl = teamLeaderMap.get(tlId)!;
          if (isNew) tl.newBusiness += amount;
          else tl.collections += amount;
        }

        const supId = policy.supervisor_id;
        if (supId) {
          if (!supervisorMap.has(supId)) {
            supervisorMap.set(supId, {
              id: supId,
              name: policy.supervisor?.full_name || 'غير معروف',
              newBusiness: 0,
              collections: 0,
            });
          }
          const sup = supervisorMap.get(supId)!;
          if (isNew) sup.newBusiness += amount;
          else sup.collections += amount;
        }
      }

      setAgentCollections(Array.from(agentMap.values()).sort((a, b) => b.totalProduction - a.totalProduction));

      setExecutiveSummary({
        supervisors: Array.from(supervisorMap.values()).sort((a, b) => (b.newBusiness + b.collections) - (a.newBusiness + a.collections)),
        teamLeaders: Array.from(teamLeaderMap.values()).sort((a, b) => (b.newBusiness + b.collections) - (a.newBusiness + a.collections)),
        target: totalTarget,
        achieved: totalProduction,
        achievementRate: totalTarget > 0 ? (totalProduction / totalTarget) * 100 : 0,
        newBusiness,
        collections,
      });
      setMetrics(metrics);

      setIsCurrentClosed(closingsRes.data?.some(c => c.month === selectedMonth && c.year === selectedYear) || false);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }

  async function closeMonth() {
    if (!profile) return;
    
    // SECURITY FIX: Use canCloseMonth from rbac.ts
    if (!canCloseMonth(profile.role as any)) {
      toast.error('ليس لديك صلاحية تقفيل الشهر');
      return;
    }

    // BUG FIX #12: Prevent closing future months
    const now = new Date();
    const isCurrentOrPast = (selectedYear < now.getFullYear()) ||
      (selectedYear === now.getFullYear() && selectedMonth <= now.getMonth() + 1);
    
    if (!isCurrentOrPast) {
      toast.error('لا يمكن تقفيل شهر مستقبلي');
      return;
    }

    if (!confirm(`هل أنت متأكد من تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}؟`)) return;

    try {
      const { error } = await supabase.from('month_closings').insert({
        month: selectedMonth,
        year: selectedYear,
        closed_by: profile?.id,
        closed_at: new Date().toISOString(),
        branch_id: activeBranch && activeBranch.id !== 'all' ? activeBranch.id : null,
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

      const agentData = agentCollections.map(a => ({
        'المندوب': a.agentName,
        'الجديد': a.newBusiness,
        'التحصيل': a.collections,
        'الإجمالي': a.totalProduction,
      }));

      const detailedData = metrics.map(m => ({
        'اسم العميل': (m.policy as any)?.client?.name || 'غير معروف',
        'رقم الوثيقة': (m.policy as any)?.policy_number || 'غير معروف',
        'النوع': m.is_new_business ? 'جديد' : 'تحصيل',
        'المبلغ': m.amount,
        'التاريخ': m.collection_date,
        'الوكيل': (m.policy as any)?.agent?.full_name || 'غير معروف',
        'الفرع': (m.policy as any)?.branch?.name || 'غير معروف'
      }));
      const detailedSheet = XLSX.utils.json_to_sheet(detailedData);
      XLSX.utils.book_append_sheet(wb, detailedSheet, 'تفاصيل العمليات');
      const agentSheet = XLSX.utils.json_to_sheet(agentData);
      XLSX.utils.book_append_sheet(wb, agentSheet, 'أداء الوكلاء');

      XLSX.writeFile(wb, `تقرير_تقفيل_${selectedMonth}_${selectedYear}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  const exportToPDF = () => {
    setExporting(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`تقرير تقفيل شهر ${getMonthName(selectedMonth)} ${selectedYear}`, 10, 20);
      (doc as any).autoTable({
        head: [['البيان', 'القيمة']],
        body: [
          ['الهدف', formatCurrency(executiveSummary.target)],
          ['المحقق', formatCurrency(executiveSummary.achieved)],
          ['نسبة الإنجاز %', formatPercent(executiveSummary.achievementRate)],
          ['الإنتاج الجديد', formatCurrency(executiveSummary.newBusiness)],
          ['التحصيل', formatCurrency(executiveSummary.collections)],
        ],
        startY: 30,
      });
      doc.save(`تقرير_تقفيل_${selectedMonth}_${selectedYear}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const canClose = profile?.role ? canCloseMonth(profile.role as any) : false;

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <PageHeader
        title="تقفيل وإغلاق الشهر"
        subtitle={`مراجعة أداء شهر ${getMonthName(selectedMonth)} ${selectedYear} (السنة الأولى فقط)`}
        icon={Calendar}
        actions={
          <div className="flex items-center gap-3">
            {canClose && !isCurrentClosed && (
              <button 
                onClick={closeMonth} 
                className="flex items-center gap-2 px-6 py-2.5 bg-danger text-white rounded-xl hover:bg-danger/90 transition-all shadow-crm font-black text-sm"
              >
                <Lock className="w-4 h-4" /> تقفيل الشهر نهائياً
              </button>
            )}
            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700 mx-2"></div>
            <button 
              onClick={exportToExcel} 
              disabled={exporting} 
              className="flex items-center gap-2 px-4 py-2.5 bg-success/10 text-success border border-success/20 rounded-xl hover:bg-success/20 transition-all font-bold text-sm disabled:opacity-50"
            >
              <FileText className="w-4 h-4" /> Excel
            </button>
            <button 
              onClick={exportToPDF} 
              disabled={exporting} 
              className="flex items-center gap-2 px-4 py-2.5 bg-danger/10 text-danger border border-danger/20 rounded-xl hover:bg-danger/20 transition-all font-bold text-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> PDF
            </button>
          </div>
        }
      />

      {/* Selectors */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-crm flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-3">
          <label className="text-xs font-black text-slate-400 uppercase tracking-wider">الشهر</label>
          <select 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(Number(e.target.value))} 
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none min-w-[140px]"
          >
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-black text-slate-400 uppercase tracking-wider">السنة</label>
          <select 
            value={selectedYear} 
            onChange={e => setSelectedYear(Number(e.target.value))} 
            className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-bold appearance-none min-w-[120px]"
          >
            {Array.from({ length: 5 }, (_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
          </select>
        </div>
        {isCurrentClosed && (
          <div className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success rounded-full border border-success/20 ml-auto">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-black">تم تقفيل هذا الشهر</span>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard title="إجمالي الجديد" value={monthData.newBusiness} icon={Award} color="primary" />
        <SummaryCard title="إجمالي التحصيل" value={monthData.collections} icon={Wallet} color="success" />
        <SummaryCard title="الإنتاج الكلي" value={monthData.totalProduction} icon={TrendingUp} color="secondary" />
        <SummaryCard title="نسبة الإنجاز" value={monthData.collectionRate} icon={Target} color="warning" isPercent />
      </div>

      {/* Agent Performance Table */}
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-crm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
              <User className="w-5 h-5 text-primary" />
            </div>
            تفاصيل أداء الوكلاء
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="bg-white dark:bg-slate-900">
                <th className="px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">الوكيل</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">الجديد</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">التحصيل</th>
                <th className="px-6 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">الإجمالي</th>
                <th className="px-8 py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800 text-center">العمليات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {agentCollections.map((agent, idx) => (
                <tr key={agent.agentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black text-slate-300 w-4">{idx + 1}</span>
                      <span className="text-sm font-black text-slate-900 dark:text-white">{agent.agentName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-primary">{formatCurrency(agent.newBusiness)}</td>
                  <td className="px-6 py-4 text-sm font-bold text-success">{formatCurrency(agent.collections)}</td>
                  <td className="px-6 py-4 text-sm font-black text-slate-900 dark:text-white">{formatCurrency(agent.totalProduction)}</td>
                  <td className="px-8 py-4 text-center">
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-black text-slate-500">
                      {agent.count} وثيقة
                    </span>
                  </td>
                </tr>
              ))}
              {agentCollections.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <Calendar className="w-12 h-12" />
                      <p className="text-sm font-bold">لا توجد عمليات مسجلة لهذا الشهر</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color, isPercent }: any) {
  const colorStyles: any = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    secondary: 'bg-secondary/10 text-secondary border-secondary/20',
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-crm hover:shadow-crm-lg transition-all duration-300">
      <div className="flex items-center gap-4 mb-4">
        <div className={`p-3 rounded-2xl border ${colorStyles[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{title}</p>
      </div>
      <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
        {isPercent ? formatPercent(value) : formatCurrency(value)}
      </p>
    </div>
  );
}
