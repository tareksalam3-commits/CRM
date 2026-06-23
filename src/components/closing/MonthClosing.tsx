import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { canCloseMonth } from '../../lib/rbac';
import { formatCurrency, formatPercent, getMonthName, formatDate } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Calendar, Lock, FileText, Table2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

interface MonthData {
  totalPremiums: number;
  totalRequired: number;
  totalCollected: number;
  totalOverdue: number;
  newClients: number;
  newPolicies: number;
  collectionRate: number;
}

interface AgentCollection {
  agentId: string;
  agentName: string;
  totalCollected: number;
  count: number;
}

interface GroupSummary {
  groupLeaderId: string;
  groupLeaderName: string;
  totalCollected: number;
  agents: AgentCollection[];
}

interface BranchSummary {
  branchManagerId: string;
  branchManagerName: string;
  totalCollected: number;
  groups: GroupSummary[];
}

export default function MonthClosing() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthData, setMonthData] = useState<MonthData>({ totalPremiums: 0, totalRequired: 0, totalCollected: 0, totalOverdue: 0, newClients: 0, newPolicies: 0, collectionRate: 0 });
  const [isCurrentClosed, setIsCurrentClosed] = useState(false);
  const [agentCollections, setAgentCollections] = useState<AgentCollection[]>([]);
  const [branchSummary, setBranchSummary] = useState<BranchSummary[]>([]);

  useEffect(() => { loadData(); }, [selectedMonth, selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true);
    try {
      const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
      const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
      const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const [policiesRes, collectionsRes, clientsRes, installmentsRes, closingsRes, agentCollectionsRes] = await Promise.all([
        supabase.from('policies').select('annual_premium, created_at').gte('created_at', monthStart).lt('created_at', monthEnd),
        supabase.from('collections').select('amount').gte('collection_date', monthStart).lt('collection_date', monthEnd),
        supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', monthStart).lt('created_at', monthEnd),
        supabase.from('installments').select('amount, status, due_date').gte('due_date', monthStart).lt('due_date', monthEnd),
        supabase.from('month_closings').select('month, year'),
        supabase.from('collections').select('*, policy:policies(agent_id), collector:profiles(full_name, manager_id)').gte('collection_date', monthStart).lt('collection_date', monthEnd),
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

      // Process agent collections
      const agentMap = new Map<string, { name: string; total: number; count: number }>();
      if (agentCollectionsRes.data) {
        interface CollectionData { policy?: { agent_id: string }; amount: string | number }
        for (const col of agentCollectionsRes.data as CollectionData[]) {
          const agentId = col.policy?.agent_id;
          if (agentId) {
            const existing = agentMap.get(agentId) || { name: '', total: 0, count: 0 };
            existing.total += Number(col.amount);
            existing.count += 1;
            agentMap.set(agentId, existing);
          }
        }
      }

      // Fetch agent names
      const agentIds = Array.from(agentMap.keys());
      if (agentIds.length > 0) {
        const { data: agentData } = await supabase.from('profiles').select('id, full_name').in('id', agentIds);
        if (agentData) {
          for (const agent of agentData) {
            const existing = agentMap.get(agent.id);
            if (existing) {
              existing.name = agent.full_name;
              agentMap.set(agent.id, existing);
            }
          }
        }
      }

      const agents = Array.from(agentMap.entries()).map(([id, data]) => ({
        agentId: id,
        agentName: data.name,
        totalCollected: data.total,
        count: data.count,
      }));
      setAgentCollections(agents);

      // Build branch summary
      await buildBranchSummary(agents);

      const closings = (closingsRes.data || []).map(c => ({ month: c.month, year: c.year }));
      setIsCurrentClosed(closings.some(c => c.month === selectedMonth && c.year === selectedYear));
    } catch (err) {
      console.error('Error loading month data:', err);
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }

  async function buildBranchSummary(agents: AgentCollection[]) {
    try {
      const agentIds = agents.map(a => a.agentId);
      if (agentIds.length === 0) {
        setBranchSummary([]);
        return;
      }

      const { data: agentProfiles } = await supabase.from('profiles').select('id, full_name, manager_id').in('id', agentIds);
      if (!agentProfiles) return;

      // Group by manager (group leader)
      const groupMap = new Map<string, { name: string; agents: AgentCollection[]; total: number }>();
      for (const agent of agentProfiles) {
        const managerId = agent.manager_id || 'unassigned';
        const agentData = agents.find(a => a.agentId === agent.id);
        if (agentData) {
          const existing = groupMap.get(managerId) || { name: '', agents: [], total: 0 };
          existing.agents.push(agentData);
          existing.total += agentData.totalCollected;
          groupMap.set(managerId, existing);
        }
      }

      // Fetch manager names
      const managerIds = Array.from(groupMap.keys()).filter(id => id !== 'unassigned');
      if (managerIds.length > 0) {
        const { data: managerData } = await supabase.from('profiles').select('id, full_name, manager_id').in('id', managerIds);
        if (managerData) {
          for (const manager of managerData) {
            const existing = groupMap.get(manager.id);
            if (existing) {
              existing.name = manager.full_name;
              groupMap.set(manager.id, existing);
            }
          }
        }
      }

      // Build branch summary
      const branchMap = new Map<string, { name: string; groups: GroupSummary[]; total: number }>();
      for (const [groupId, groupData] of groupMap.entries()) {
        // Get group leader's manager (branch manager)
        let branchId = 'unassigned';
        if (groupId !== 'unassigned') {
          const groupLeader = agentProfiles.find(p => p.id === groupId);
          branchId = groupLeader?.manager_id || 'unassigned';
        }

        const existing = branchMap.get(branchId) || { name: '', groups: [], total: 0 };
        existing.groups.push({
          groupLeaderId: groupId,
          groupLeaderName: groupData.name,
          totalCollected: groupData.total,
          agents: groupData.agents,
        });
        existing.total += groupData.total;
        branchMap.set(branchId, existing);
      }

      // Fetch branch manager names
      const branchIds = Array.from(branchMap.keys()).filter(id => id !== 'unassigned');
      if (branchIds.length > 0) {
        const { data: branchData } = await supabase.from('profiles').select('id, full_name').in('id', branchIds);
        if (branchData) {
          for (const branch of branchData) {
            const existing = branchMap.get(branch.id);
            if (existing) {
              existing.name = branch.full_name;
              branchMap.set(branch.id, existing);
            }
          }
        }
      }

      const branches = Array.from(branchMap.entries()).map(([id, data]) => ({
        branchManagerId: id,
        branchManagerName: data.name,
        totalCollected: data.total,
        groups: data.groups,
      }));
      setBranchSummary(branches);
    } catch (err) {
      console.error('Error building branch summary:', err);
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

    const { error } = await supabase.from('month_closings').insert({
      closed_by: profile.id,
      month: selectedMonth,
      year: selectedYear,
      total_premiums: monthData.totalPremiums,
      total_collections: monthData.totalCollected,
      collection_rate: monthData.collectionRate,
    });

    if (error) { toast.error('خطأ في تقفيل الشهر'); return; }
    toast.success('تم تقفيل الشهر بنجاح');
    loadData();
  }

  async function exportToExcel() {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ['ملخص شهر ' + getMonthName(selectedMonth) + ' ' + selectedYear],
        [],
        ['المقياس', 'القيمة'],
        ['إجمالي الإنتاج', formatCurrency(monthData.totalPremiums)],
        ['إجمالي المطلوب تحصيله', formatCurrency(monthData.totalRequired)],
        ['إجمالي المحصل', formatCurrency(monthData.totalCollected)],
        ['المتأخرات', formatCurrency(monthData.totalOverdue)],
        ['عملاء جدد', monthData.newClients],
        ['وثائق جديدة', monthData.newPolicies],
        ['نسبة التحصيل', formatPercent(monthData.collectionRate)],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'الملخص');

      // Agents sheet
      const agentData = [
        ['تقرير الأجنت - شهر ' + getMonthName(selectedMonth) + ' ' + selectedYear],
        [],
        ['اسم الأجنت', 'عدد العمليات', 'إجمالي المحصل'],
        ...agentCollections.map(a => [a.agentName, a.count, formatCurrency(a.totalCollected)]),
        [],
        ['الإجمالي', agentCollections.reduce((s, a) => s + a.count, 0), formatCurrency(agentCollections.reduce((s, a) => s + a.totalCollected, 0))],
      ];
      const agentSheet = XLSX.utils.aoa_to_sheet(agentData);
      XLSX.utils.book_append_sheet(wb, agentSheet, 'الأجنت');

      // Branch summary sheet
      const branchData: Array<Array<string | number>> = [
        ['تقرير الفروع والمجموعات - شهر ' + getMonthName(selectedMonth) + ' ' + selectedYear],
        [],
        ['اسم الفرع', 'اسم المجموعة', 'اسم الأجنت', 'عدد العمليات', 'إجمالي المحصل'],
      ];
      for (const branch of branchSummary) {
        for (const group of branch.groups) {
          for (const agent of group.agents) {
            branchData.push([
              branch.branchManagerName || 'بدون فرع',
              group.groupLeaderName || 'بدون مجموعة',
              agent.agentName,
              agent.count,
              formatCurrency(agent.totalCollected),
            ]);
          }
          branchData.push(['', group.groupLeaderName + ' (إجمالي)', '', group.agents.reduce((s, a) => s + a.count, 0), formatCurrency(group.totalCollected)]);
        }
        branchData.push([branch.branchManagerName + ' (إجمالي الفرع)', '', '', branch.groups.reduce((s, g) => s + g.agents.reduce((ss, a) => ss + a.count, 0), 0), formatCurrency(branch.totalCollected)]);
        branchData.push([]);
      }
      const branchSheet = XLSX.utils.aoa_to_sheet(branchData);
      XLSX.utils.book_append_sheet(wb, branchSheet, 'الفروع');

      // Save file
      const fileName = `تقرير_التحصيل_${getMonthName(selectedMonth)}_${selectedYear}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('تم تصدير الملف بنجاح');
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      toast.error('خطأ في تصدير الملف');
    } finally {
      setExporting(false);
    }
  }

  async function exportToPDF() {
    setExporting(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Set Arabic font
      doc.setLanguage('ar');
      doc.setFont('Arial', 'normal');

      // Title
      doc.setFontSize(16);
      doc.text(`تقرير التحصيل - شهر ${getMonthName(selectedMonth)} ${selectedYear}`, 105, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`تاريخ الطباعة: ${formatDate(new Date().toISOString())}`, 105, 22, { align: 'center' });

      // Summary section
      doc.setFontSize(12);
      doc.text('الملخص التنفيذي', 10, 35);
      doc.setFontSize(10);
      const summaryTable = [
        ['المقياس', 'القيمة'],
        ['إجمالي الإنتاج', formatCurrency(monthData.totalPremiums)],
        ['إجمالي المطلوب تحصيله', formatCurrency(monthData.totalRequired)],
        ['إجمالي المحصل', formatCurrency(monthData.totalCollected)],
        ['المتأخرات', formatCurrency(monthData.totalOverdue)],
        ['نسبة التحصيل', formatPercent(monthData.collectionRate)],
      ];
      interface AutoTableOptions { head: (string | number)[][]; body: (string | number)[][]; startY: number; theme: string; styles: Record<string, string> }
      (doc as unknown as { autoTable: (opts: AutoTableOptions) => void }).autoTable({
        head: [summaryTable[0]],
        body: summaryTable.slice(1),
        startY: 40,
        theme: 'grid',
        styles: { halign: 'right', font: 'Arial' },
      });

      // Agents section
      interface AutoTableResult { lastAutoTable: { finalY: number } }
      let yPosition = ((doc as unknown) as AutoTableResult).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('تقرير الأجنت', 10, yPosition);
      yPosition += 5;

      const agentTable = [
        ['اسم الأجنت', 'عدد العمليات', 'إجمالي المحصل'],
        ...agentCollections.map(a => [a.agentName, a.count.toString(), formatCurrency(a.totalCollected)]),
      ];
      (doc as unknown as { autoTable: (opts: AutoTableOptions) => void }).autoTable({
        head: [agentTable[0]],
        body: agentTable.slice(1),
        startY: yPosition,
        theme: 'grid',
        styles: { halign: 'right', font: 'Arial' },
      });

      // Branch summary section
      yPosition = ((doc as unknown) as AutoTableResult).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.text('تقرير الفروع والمجموعات', 10, yPosition);
      yPosition += 5;

      const branchTable: Array<Array<string | number>> = [
        ['اسم الفرع', 'اسم المجموعة', 'اسم الأجنت', 'عدد العمليات', 'إجمالي المحصل'],
      ];
      for (const branch of branchSummary) {
        for (const group of branch.groups) {
          for (const agent of group.agents) {
            branchTable.push([
              branch.branchManagerName || 'بدون فرع',
              group.groupLeaderName || 'بدون مجموعة',
              agent.agentName,
              agent.count.toString(),
              formatCurrency(agent.totalCollected),
            ]);
          }
        }
      }

      (doc as unknown as { autoTable: (opts: AutoTableOptions) => void }).autoTable({
        head: [branchTable[0]],
        body: branchTable.slice(1),
        startY: yPosition,
        theme: 'grid',
        styles: { halign: 'right', font: 'Arial' },
      });

      // Save PDF
      const fileName = `تقرير_التحصيل_${getMonthName(selectedMonth)}_${selectedYear}.pdf`;
      (doc as unknown as { save: (name: string) => void }).save(fileName);
      toast.success('تم تصدير الملف بنجاح');
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      toast.error('خطأ في تصدير الملف');
    } finally {
      setExporting(false);
    }
  }

  // FIX: Use canCloseMonth from rbac instead of hardcoded role check
  const canClose = profile?.role ? canCloseMonth(profile.role as any) : false;

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="تقفيل الشهر" description="ملخص وإغلاق الشهر مع تصدير التقارير" icon={Calendar} />

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

      {/* Agent Collections */}
      {agentCollections.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">تحصيلات الأجنت</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-right px-4 py-3 text-slate-600 dark:text-slate-400">اسم الأجنت</th>
                  <th className="text-right px-4 py-3 text-slate-600 dark:text-slate-400">عدد العمليات</th>
                  <th className="text-right px-4 py-3 text-slate-600 dark:text-slate-400">إجمالي المحصل</th>
                </tr>
              </thead>
              <tbody>
                {agentCollections.map(agent => (
                  <tr key={agent.agentId} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-3 text-slate-900 dark:text-white">{agent.agentName}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{agent.count}</td>
                    <td className="px-4 py-3 text-slate-900 dark:text-white font-semibold">{formatCurrency(agent.totalCollected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Branch Summary */}
      {branchSummary.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 mb-6">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-4">ملخص الفروع والمجموعات</h3>
          <div className="space-y-4">
            {branchSummary.map(branch => (
              <div key={branch.branchManagerId} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="font-semibold text-slate-900 dark:text-white">{branch.branchManagerName || 'بدون فرع'}</h4>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(branch.totalCollected)}</span>
                </div>
                <div className="space-y-2">
                  {branch.groups.map(group => (
                    <div key={group.groupLeaderId} className="ml-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{group.groupLeaderName || 'بدون مجموعة'}</span>
                        <span className="text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(group.totalCollected)}</span>
                      </div>
                      <div className="space-y-1">
                        {group.agents.map(agent => (
                          <div key={agent.agentId} className="ml-4 flex justify-between text-xs text-slate-600 dark:text-slate-400">
                            <span>{agent.agentName}</span>
                            <span>{formatCurrency(agent.totalCollected)} ({agent.count})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export and Close Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={exportToExcel}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white rounded-xl font-medium transition-all"
        >
          <Table2 className="w-5 h-5" />
          {exporting ? 'جاري التصدير...' : 'تصدير Excel'}
        </button>
        <button
          onClick={exportToPDF}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white rounded-xl font-medium transition-all"
        >
          <FileText className="w-5 h-5" />
          {exporting ? 'جاري التصدير...' : 'تصدير PDF'}
        </button>
        {/* FIX: Use canClose from rbac instead of hardcoded check */}
        {canClose && !isCurrentClosed && (
          <button
            onClick={closeMonth}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium shadow-lg shadow-amber-600/30 transition-all ml-auto"
          >
            <Lock className="w-5 h-5" />
            تقفيل شهر {getMonthName(selectedMonth)} {selectedYear}
          </button>
        )}
      </div>
    </div>
  );
}
