import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Target as TargetType, ROLE_LABELS, Profile } from '../../types';
import { canManageTargets } from '../../lib/rbac';
import { formatCurrency } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Target, Plus, X, TrendingUp, TrendingDown, Edit2, Trash2, Users, User, Copy, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const MONTHS = [
  { num: 1, name: 'يناير' },
  { num: 2, name: 'فبراير' },
  { num: 3, name: 'مارس' },
  { num: 4, name: 'أبريل' },
  { num: 5, name: 'مايو' },
  { num: 6, name: 'يونيو' },
  { num: 7, name: 'يوليو' },
  { num: 8, name: 'أغسطس' },
  { num: 9, name: 'سبتمبر' },
  { num: 10, name: 'أكتوبر' },
  { num: 11, name: 'نوفمبر' },
  { num: 12, name: 'ديسمبر' },
];

// ── جيب كل IDs اللي تحت مستخدم معين (recursive) ───────────────────────────
function getSubordinateIds(userId: string, allProfiles: Profile[]): string[] {
  const directReports = allProfiles.filter(p => p.manager_id === userId).map(p => p.id);
  const allIds: string[] = [...directReports];
  for (const id of directReports) {
    allIds.push(...getSubordinateIds(id, allProfiles));
  }
  return allIds;
}

interface EnrichedTarget extends Omit<TargetType, 'user'> {
  user?: { full_name: string; role: string };
  achieved: number;
  isManagerTarget: boolean;
  subordinateCount: number;
}

type ModalMode = 'add' | 'edit' | 'bulk_add' | 'copy_year' | null;

export default function TargetManagement() {
  const { profile } = useAuth();
  const [targets, setTargets] = useState<EnrichedTarget[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingTarget, setEditingTarget] = useState<EnrichedTarget | null>(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [filterRole, setFilterRole] = useState<'all' | 'agent' | 'manager'>('all');

  // Form state for single target
  const [form, setForm] = useState({
    user_id: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    target_amount: '',
  });

  // Form state for bulk operations
  const [bulkForm, setBulkForm] = useState({
    user_id: '',
    year: new Date().getFullYear(),
    monthly_amount: '',
  });

  // Form state for copy year
  const [copyForm, setCopyForm] = useState({
    source_year: new Date().getFullYear() - 1,
    target_year: new Date().getFullYear(),
  });

  const canManage = profile ? canManageTargets(profile.role) : false;

  const loadData = useCallback(async () => {
    setLoading(true);

    let profilesQuery = supabase.from('profiles').select('*').eq('is_active', true);
    let targetsQuery = supabase.from('targets').select('*, user:profiles(full_name, role, branch_id)')
      .eq('period_type', 'monthly')
      .order('year', { ascending: false })
      .order('period_number', { ascending: false });

    if (profile && !['super_admin', 'dev_manager', 'general_supervisor'].includes(profile.role)) {
      if (profile.branch_id) {
        profilesQuery = profilesQuery.eq('branch_id', profile.branch_id);
      }
    }

    const [targetsRes, profilesRes, policiesRes] = await Promise.all([
      targetsQuery,
      profilesQuery,
      supabase.from('policies').select('agent_id, annual_premium, issue_date'),
    ]);

    const profiles: Profile[] = profilesRes.data || [];
    const policies = policiesRes.data || [];
    const rawTargets = targetsRes.data || [];

    const filtered = rawTargets.filter(t => {
      if (filterYear && t.year !== filterYear) return false;
      if (filterMonth && t.period_number !== filterMonth) return false;
      return true;
    });

    const enriched: EnrichedTarget[] = filtered.map((t) => {
      const userProfile = profiles.find(p => p.id === t.user_id);
      const isAgent = userProfile?.role === 'agent';
      const isManagerTarget = !isAgent;

      let achieved = 0;

      if (isAgent) {
        const monthStart = `${t.year}-${String(t.period_number).padStart(2, '0')}-01`;
        const nextMonth = t.period_number === 12 ? 1 : t.period_number + 1;
        const nextYear = t.period_number === 12 ? t.year + 1 : t.year;
        const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
        
        achieved = policies
          .filter(p => p.agent_id === t.user_id && p.issue_date >= monthStart && p.issue_date < monthEnd)
          .reduce((s, p) => s + Number(p.annual_premium), 0);
      } else {
        const subordinateIds = getSubordinateIds(t.user_id, profiles);
        const monthStart = `${t.year}-${String(t.period_number).padStart(2, '0')}-01`;
        const nextMonth = t.period_number === 12 ? 1 : t.period_number + 1;
        const nextYear = t.period_number === 12 ? t.year + 1 : t.year;
        const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
        
        achieved = policies
          .filter(p => subordinateIds.includes(p.agent_id) && p.issue_date >= monthStart && p.issue_date < monthEnd)
          .reduce((s, p) => s + Number(p.annual_premium), 0);
      }

      const subordinateCount = isManagerTarget ? getSubordinateIds(t.user_id, profiles).length : 0;

      return {
        ...t,
        achieved,
        isManagerTarget,
        subordinateCount,
      } as EnrichedTarget;
    });

    const finalTargets = filterRole === 'all' ? enriched
      : filterRole === 'agent'
        ? enriched.filter(t => !t.isManagerTarget)
        : enriched.filter(t => t.isManagerTarget);

    setTargets(finalTargets);
    setAllProfiles(profiles);
    setLoading(false);
  }, [filterYear, filterMonth, filterRole, profile]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Validate form data
  function validateForm(): boolean {
    if (!form.user_id || !form.target_amount) {
      toast.error('يرجى ملء جميع الحقول');
      return false;
    }
    const amount = Number(form.target_amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('يجب أن يكون مبلغ التارجت أكبر من صفر');
      return false;
    }
    return true;
  }

  // ── Single target submit
  async function handleSubmit() {
    if (!validateForm()) return;

    const payload = {
      user_id: form.user_id,
      period_type: 'monthly' as const,
      year: form.year,
      period_number: form.month,
      target_amount: Number(form.target_amount),
    };

    try {
      if (editingTarget) {
        const { error } = await supabase.from('targets')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingTarget.id);
        if (error) throw error;
        toast.success('تم تحديث التارجت');
      } else {
        const { error } = await supabase.from('targets').upsert(payload, { onConflict: 'user_id,period_type,year,period_number' });
        if (error) throw error;
        toast.success('تم حفظ التارجت');
      }
      closeModal();
      loadData();
    } catch (error: any) {
      toast.error('خطأ: ' + error.message);
    }
  }

  // ── Bulk add targets for entire year
  async function handleBulkAdd() {
    if (!bulkForm.user_id || !bulkForm.monthly_amount) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }

    const amount = Number(bulkForm.monthly_amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('يجب أن يكون مبلغ التارجت أكبر من صفر');
      return;
    }

    try {
      const targets_to_insert = Array.from({ length: 12 }, (_, i) => ({
        user_id: bulkForm.user_id,
        period_type: 'monthly' as const,
        year: bulkForm.year,
        period_number: i + 1,
        target_amount: amount,
      }));

      const { error } = await supabase.from('targets').upsert(targets_to_insert, { onConflict: 'user_id,period_type,year,period_number' });
      if (error) throw error;
      toast.success(`تم إضافة 12 تارجت شهري للسنة ${bulkForm.year}`);
      closeModal();
      loadData();
    } catch (error: any) {
      toast.error('خطأ: ' + error.message);
    }
  }

  // ── Copy targets from previous year
  async function handleCopyYear() {
    if (copyForm.source_year === copyForm.target_year) {
      toast.error('يجب اختيار سنتين مختلفتين');
      return;
    }

    try {
      const { data: sourceTargets, error: fetchError } = await supabase.from('targets')
        .select('*')
        .eq('year', copyForm.source_year)
        .eq('period_type', 'monthly');

      if (fetchError) throw fetchError;
      if (!sourceTargets || sourceTargets.length === 0) {
        toast.error(`لا توجد تارجتات للسنة ${copyForm.source_year}`);
        return;
      }

      const newTargets = sourceTargets.map(t => ({
        user_id: t.user_id,
        period_type: t.period_type,
        year: copyForm.target_year,
        period_number: t.period_number,
        target_amount: t.target_amount,
      }));

      const { error } = await supabase.from('targets').upsert(newTargets, { onConflict: 'user_id,period_type,year,period_number' });
      if (error) throw error;
      toast.success(`تم نسخ التارجتات من ${copyForm.source_year} إلى ${copyForm.target_year}`);
      closeModal();
      loadData();
    } catch (error: any) {
      toast.error('خطأ: ' + error.message);
    }
  }

  // ── Bulk add for all users in a year
  async function handleBulkAddAllUsers() {
    if (!bulkForm.monthly_amount) {
      toast.error('يرجى إدخال مبلغ التارجت');
      return;
    }

    const amount = Number(bulkForm.monthly_amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('يجب أن يكون مبلغ التارجت أكبر من صفر');
      return;
    }

    try {
      const targets_to_insert = allProfiles
        .flatMap(user =>
          Array.from({ length: 12 }, (_, i) => ({
            user_id: user.id,
            period_type: 'monthly' as const,
            year: bulkForm.year,
            period_number: i + 1,
            target_amount: amount,
          }))
        );

      const { error } = await supabase.from('targets').upsert(targets_to_insert, { onConflict: 'user_id,period_type,year,period_number' });
      if (error) throw error;
      toast.success(`تم إضافة تارجتات لـ ${allProfiles.length} موظف للسنة ${bulkForm.year}`);
      closeModal();
      loadData();
    } catch (error: any) {
      toast.error('خطأ: ' + error.message);
    }
  }

  async function deleteTarget(id: string) {
    if (!confirm('حذف هذا التارجت؟')) return;
    try {
      const { error } = await supabase.from('targets').delete().eq('id', id);
      if (error) throw error;
      toast.success('تم حذف التارجت');
      loadData();
    } catch (error: any) {
      toast.error('خطأ: ' + error.message);
    }
  }

  // ── Close modal and reset form
  function closeModal() {
    setModalMode(null);
    setEditingTarget(null);
    setForm({ user_id: '', year: new Date().getFullYear(), month: new Date().getMonth() + 1, target_amount: '' });
    setBulkForm({ user_id: '', year: new Date().getFullYear(), monthly_amount: '' });
    setCopyForm({ source_year: new Date().getFullYear() - 1, target_year: new Date().getFullYear() });
  }

  // ── Open add modal
  function openAddModal() {
    setEditingTarget(null);
    setForm({ user_id: '', year: new Date().getFullYear(), month: new Date().getMonth() + 1, target_amount: '' });
    setModalMode('add');
  }

  // ── Open bulk add modal
  function openBulkAddModal() {
    setBulkForm({ user_id: '', year: new Date().getFullYear(), monthly_amount: '' });
    setModalMode('bulk_add');
  }

  // ── Open copy year modal
  function openCopyYearModal() {
    setCopyForm({ source_year: new Date().getFullYear() - 1, target_year: new Date().getFullYear() });
    setModalMode('copy_year');
  }

  // ── Edit target
  function startEdit(t: EnrichedTarget) {
    setEditingTarget(t);
    setForm({ user_id: t.user_id, year: t.year, month: t.period_number, target_amount: String(t.target_amount) });
    setModalMode('edit');
  }

  const totalTarget = targets.reduce((s, t) => s + t.target_amount, 0);
  const totalAchieved = targets.reduce((s, t) => s + t.achieved, 0);
  const overallPct = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

  if (loading) return <LoadingSpinner />;

  const agentUsers = allProfiles.filter(p => p.role === 'agent');
  const managerUsers = allProfiles.filter(p => p.role !== 'agent');

  return (
    <div>
      <PageHeader
        title="إدارة التارجتات"
        description={`${targets.length} تارجت`}
        icon={Target}
        actions={canManage ? (
          <div className="flex gap-2 flex-wrap">
            <button onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">إضافة تارجت</span>
            </button>
            <button onClick={openBulkAddModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Zap className="w-4 h-4" /><span className="hidden sm:inline">إضافة سنة</span>
            </button>
            <button onClick={openCopyYearModal}
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium transition-colors">
              <Copy className="w-4 h-4" /><span className="hidden sm:inline">نسخ سنة</span>
            </button>
          </div>
        ) : undefined}
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'إجمالي التارجت', value: formatCurrency(totalTarget), icon: Target, color: 'text-blue-600' },
          { label: 'إجمالي المحقق', value: formatCurrency(totalAchieved), icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'نسبة الإنجاز', value: `${overallPct.toFixed(1)}%`, icon: overallPct >= 80 ? TrendingUp : TrendingDown, color: overallPct >= 80 ? 'text-emerald-600' : 'text-red-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
            <div className={`w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700 flex items-center justify-center mb-2 ${k.color}`}>
              <k.icon className="w-4 h-4" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value === '' ? '' : Number(e.target.value))}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">كل الشهور</option>
          {MONTHS.map(m => <option key={m.num} value={m.num}>{m.name}</option>)}
        </select>
        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          {[
            { key: 'all', label: 'الكل' },
            { key: 'agent', label: 'أجنت' },
            { key: 'manager', label: 'مدير' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setFilterRole(opt.key as 'all' | 'agent' | 'manager')}
              className={`px-3 py-2 text-sm transition-colors ${filterRole === opt.key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Targets List */}
      <div className="space-y-3">
        {targets.map(t => {
          const pct = t.target_amount > 0 ? Math.min((t.achieved / t.target_amount) * 100, 100) : 0;
          const userObj = t.user as { full_name: string; role: string } | undefined;
          const monthName = MONTHS.find(m => m.num === t.period_number)?.name || '';
          return (
            <div key={t.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${t.isManagerTarget ? 'bg-purple-100 dark:bg-purple-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                    {t.isManagerTarget
                      ? <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      : <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    }
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{userObj?.full_name || '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {userObj?.role ? ROLE_LABELS[userObj.role as keyof typeof ROLE_LABELS] : ''} — {monthName} {t.year}
                      {t.isManagerTarget && t.subordinateCount > 0 && (
                        <span className="mr-1 text-purple-500">({t.subordinateCount} موظف)</span>
                      )}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => startEdit(t)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><Edit2 className="w-4 h-4 text-slate-500" /></button>
                    <button onClick={() => deleteTarget(t.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 className="w-4 h-4 text-red-500" /></button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-500 dark:text-slate-400">
                  التارجت: <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(t.target_amount)}</span>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  المحقق: <span className={`font-semibold ${t.achieved >= t.target_amount ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>{formatCurrency(t.achieved)}</span>
                </span>
                <span className={`font-bold text-sm ${pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                  {pct.toFixed(1)}%
                </span>
              </div>

              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {t.isManagerTarget && (
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  * التحقيق يشمل إنتاج جميع الموظفين التابعين له
                </p>
              )}
            </div>
          );
        })}
        {targets.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>لا توجد تارجتات</p>
          </div>
        )}
      </div>

      {/* Modal for Add/Edit Single Target */}
      {(modalMode === 'add' || modalMode === 'edit') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingTarget ? 'تعديل التارجت' : 'إضافة تارجت'}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الموظف</label>
                <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">اختر موظف</option>
                  <optgroup label="── المديرون ──">
                    {managerUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} — {ROLE_LABELS[u.role]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── الأجنت ──">
                    {agentUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الشهر</label>
                  <select value={form.month} onChange={e => setForm({ ...form, month: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {MONTHS.map(m => <option key={m.num} value={m.num}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
                  <select value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">مبلغ التارجت</label>
                <input type="number" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" dir="ltr" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                  {editingTarget ? 'تحديث' : 'حفظ'}
                </button>
                <button onClick={closeModal} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Bulk Add */}
      {modalMode === 'bulk_add' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">إضافة تارجتات سنة كاملة</h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الموظف</label>
                <select value={bulkForm.user_id} onChange={e => setBulkForm({ ...bulkForm, user_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">اختر موظف</option>
                  <option value="all">جميع الموظفين</option>
                  <optgroup label="── المديرون ──">
                    {managerUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} — {ROLE_LABELS[u.role]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── الأجنت ──">
                    {agentUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
                <select value={bulkForm.year} onChange={e => setBulkForm({ ...bulkForm, year: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">مبلغ التارجت الشهري</label>
                <input type="number" value={bulkForm.monthly_amount} onChange={e => setBulkForm({ ...bulkForm, monthly_amount: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" dir="ltr" />
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <p className="font-medium mb-1">سيتم إنشاء:</p>
                <p>12 تارجت شهري × {bulkForm.monthly_amount || '0'} جنيه = {Number(bulkForm.monthly_amount || 0) * 12} جنيه سنوياً</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={bulkForm.user_id === 'all' ? handleBulkAddAllUsers : handleBulkAdd} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors">
                  إضافة
                </button>
                <button onClick={closeModal} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Copy Year */}
      {modalMode === 'copy_year' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">نسخ تارجتات سنة</h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة المصدر</label>
                <select value={copyForm.source_year} onChange={e => setCopyForm({ ...copyForm, source_year: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة المقصد</label>
                <select value={copyForm.target_year} onChange={e => setCopyForm({ ...copyForm, target_year: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-sm text-purple-700 dark:text-purple-300">
                <p className="font-medium mb-1">سيتم نسخ:</p>
                <p>جميع التارجتات من {copyForm.source_year} إلى {copyForm.target_year}</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleCopyYear} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium transition-colors">
                  نسخ
                </button>
                <button onClick={closeModal} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
