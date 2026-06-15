import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Target as TargetType, TARGET_PERIOD_LABELS, ROLE_LABELS, TargetPeriod, Profile } from '../../types';
import { canManageTargets } from '../../lib/rbac';
import { formatCurrency } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Target, Plus, X, TrendingUp, TrendingDown, Edit2, Trash2, Users, User } from 'lucide-react';
import toast from 'react-hot-toast';

// ── حساب نطاق الفترة الزمنية ────────────────────────────────────────────────
function getPeriodDateRange(periodType: TargetPeriod, year: number, periodNumber: number) {
  if (periodType === 'monthly') {
    const start = `${year}-${String(periodNumber).padStart(2, '0')}-01`;
    const nm = periodNumber === 12 ? 1 : periodNumber + 1;
    const ny = periodNumber === 12 ? year + 1 : year;
    return { start, end: `${ny}-${String(nm).padStart(2, '0')}-01` };
  }
  if (periodType === 'quarterly') {
    const sm = (periodNumber - 1) * 3 + 1;
    const em = sm + 3;
    return { start: `${year}-${String(sm).padStart(2, '0')}-01`, end: `${em > 12 ? year + 1 : year}-${String(em > 12 ? em - 12 : em).padStart(2, '0')}-01` };
  }
  if (periodType === 'semi_annual') {
    const sm = (periodNumber - 1) * 6 + 1;
    const em = sm + 6;
    return { start: `${year}-${String(sm).padStart(2, '0')}-01`, end: `${em > 12 ? year + 1 : year}-${String(em > 12 ? em - 12 : em).padStart(2, '0')}-01` };
  }
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

// ── جيب كل IDs اللي تحت مستخدم معين (recursive) ───────────────────────────
function getSubordinateIds(userId: string, allProfiles: Profile[]): string[] {
  const directReports = allProfiles.filter(p => p.manager_id === userId).map(p => p.id);
  const allIds: string[] = [...directReports];
  for (const id of directReports) {
    allIds.push(...getSubordinateIds(id, allProfiles));
  }
  return allIds;
}

interface EnrichedTarget extends TargetType {
  user?: Pick<Profile, 'full_name' | 'role'>;
  achieved: number;
  isManagerTarget: boolean;
  subordinateCount: number;
}

export default function TargetManagement() {
  const { profile } = useAuth();
  const [targets, setTargets] = useState<EnrichedTarget[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EnrichedTarget | null>(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterPeriodType, setFilterPeriodType] = useState<TargetPeriod | ''>('monthly');
  const [filterRole, setFilterRole] = useState<'all' | 'agent' | 'manager'>('all');

  const [form, setForm] = useState({
    user_id: '',
    period_type: 'monthly' as TargetPeriod,
    year: new Date().getFullYear(),
    period_number: new Date().getMonth() + 1,
    target_amount: '',
  });

  const canManage = profile ? canManageTargets(profile.role) : false;

  const loadData = useCallback(async () => {
    setLoading(true);

    const [targetsRes, profilesRes, policiesRes] = await Promise.all([
      supabase.from('targets').select('*, user:profiles(full_name, role)')
        .order('year', { ascending: false })
        .order('period_number', { ascending: false }),
      supabase.from('profiles').select('*').eq('is_active', true),
      supabase.from('policies').select('agent_id, annual_premium, issue_date'),
    ]);

    const profiles: Profile[] = profilesRes.data || [];
    const policies = policiesRes.data || [];
    const rawTargets = targetsRes.data || [];

    // فلتر التارجتات بالسنة والفترة
    const filtered = rawTargets.filter(t => {
      if (filterYear && t.year !== filterYear) return false;
      if (filterPeriodType && t.period_type !== filterPeriodType) return false;
      return true;
    });

    const enriched: EnrichedTarget[] = filtered.map((t) => {
      const { start, end } = getPeriodDateRange(t.period_type as TargetPeriod, t.year, t.period_number);
      const userProfile = profiles.find(p => p.id === t.user_id);
      const isAgent = userProfile?.role === 'agent';
      const isManagerTarget = !isAgent;

      let achieved = 0;

      if (isAgent) {
        // الأجنت: تحقيقه = وثائقه هو فقط في الفترة دي
        achieved = policies
          .filter(p => p.agent_id === t.user_id && p.issue_date >= start && p.issue_date < end)
          .reduce((s, p) => s + Number(p.annual_premium), 0);
      } else {
        // المدير: تحقيقه = مجموع تحقيق كل من تحته (recursive) في الفترة دي
        const subordinateIds = getSubordinateIds(t.user_id, profiles);
        achieved = policies
          .filter(p => subordinateIds.includes(p.agent_id) && p.issue_date >= start && p.issue_date < end)
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

    // فلتر بالدور
    const finalTargets = filterRole === 'all' ? enriched
      : filterRole === 'agent'
        ? enriched.filter(t => !t.isManagerTarget)
        : enriched.filter(t => t.isManagerTarget);

    setTargets(finalTargets);
    setAllProfiles(profiles);
    setLoading(false);
  }, [filterYear, filterPeriodType, filterRole]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit() {
    if (!form.user_id || !form.target_amount) { toast.error('يرجى ملء جميع الحقول'); return; }

    const payload = {
      user_id: form.user_id,
      period_type: form.period_type,
      year: form.year,
      period_number: form.period_number,
      target_amount: Number(form.target_amount),
    };

    const { error } = editingTarget
      ? await supabase.from('targets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingTarget.id)
      : await supabase.from('targets').upsert(payload, { onConflict: 'user_id,period_type,year,period_number' });

    if (error) { toast.error('خطأ: ' + error.message); }
    else { toast.success(editingTarget ? 'تم التحديث' : 'تم الحفظ'); resetForm(); loadData(); }
  }

  async function deleteTarget(id: string) {
    if (!confirm('حذف هذا التارجت؟')) return;
    const { error } = await supabase.from('targets').delete().eq('id', id);
    if (!error) { toast.success('تم الحذف'); loadData(); }
    else toast.error('خطأ: ' + error.message);
  }

  function resetForm() {
    setShowForm(false);
    setEditingTarget(null);
    setForm({ user_id: '', period_type: 'monthly', year: new Date().getFullYear(), period_number: new Date().getMonth() + 1, target_amount: '' });
  }

  function startEdit(t: EnrichedTarget) {
    setEditingTarget(t);
    setForm({ user_id: t.user_id, period_type: t.period_type, year: t.year, period_number: t.period_number, target_amount: String(t.target_amount) });
    setShowForm(true);
  }

  const totalTarget = targets.reduce((s, t) => s + t.target_amount, 0);
  const totalAchieved = targets.reduce((s, t) => s + t.achieved, 0);
  const overallPct = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

  if (loading) return <LoadingSpinner />;

  const periodNumbers = form.period_type === 'monthly' ? 12 : form.period_type === 'quarterly' ? 4 : form.period_type === 'semi_annual' ? 2 : 1;

  // قائمة المستخدمين في الفورم — أجنت أو مدير حسب الاختيار
  const agentUsers = allProfiles.filter(p => p.role === 'agent');
  const managerUsers = allProfiles.filter(p => p.role !== 'agent');

  return (
    <div>
      <PageHeader
        title="إدارة التارجتات"
        description={`${targets.length} تارجت`}
        icon={Target}
        actions={canManage ? (
          <button onClick={() => { setEditingTarget(null); resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">إضافة تارجت</span>
          </button>
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
        <select value={filterPeriodType} onChange={e => setFilterPeriodType(e.target.value as TargetPeriod | '')}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">كل الفترات</option>
          {(Object.entries(TARGET_PERIOD_LABELS) as [TargetPeriod, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {/* فلتر نوع المستخدم */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          {[
            { key: 'all', label: 'الكل' },
            { key: 'agent', label: 'أجنت' },
            { key: 'manager', label: 'مدير' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setFilterRole(opt.key as any)}
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
                      {userObj?.role ? ROLE_LABELS[userObj.role as keyof typeof ROLE_LABELS] : ''} —{' '}
                      {TARGET_PERIOD_LABELS[t.period_type]} {t.period_number}/{t.year}
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

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingTarget ? 'تعديل التارجت' : 'إضافة تارجت'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            <div className="space-y-4">
              {/* اختيار نوع التارجت */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">نوع التارجت</label>
                <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                  <button
                    onClick={() => setForm({ ...form, user_id: '' })}
                    className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors ${!form.user_id || agentUsers.find(u => u.id === form.user_id) ? 'bg-blue-600 text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    <User className="w-4 h-4" /> أجنت
                  </button>
                  <button
                    onClick={() => setForm({ ...form, user_id: '' })}
                    className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors ${form.user_id && managerUsers.find(u => u.id === form.user_id) ? 'bg-purple-600 text-white' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    <Users className="w-4 h-4" /> مدير
                  </button>
                </div>
              </div>

              {/* اختيار الموظف */}
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">نوع الفترة</label>
                  <select value={form.period_type} onChange={e => setForm({ ...form, period_type: e.target.value as TargetPeriod, period_number: 1 })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(TARGET_PERIOD_LABELS) as [TargetPeriod, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">رقم الفترة</label>
                  <select value={form.period_number} onChange={e => setForm({ ...form, period_number: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {Array.from({ length: periodNumbers }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
                  <select value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">مبلغ التارجت</label>
                  <input type="number" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" dir="ltr" />
                </div>
              </div>

              {/* معاينة التحقيق للمدير */}
              {form.user_id && managerUsers.find(u => u.id === form.user_id) && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-sm text-purple-700 dark:text-purple-300">
                  <p className="font-medium mb-1">ملاحظة للمديرين:</p>
                  <p>التحقيق سيُحسب تلقائياً كمجموع إنتاج جميع الموظفين التابعين لهذا المدير في الفترة المحددة.</p>
                  <p className="mt-1">عدد المرؤوسين: <span className="font-bold">{getSubordinateIds(form.user_id, allProfiles).length}</span></p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">
                  {editingTarget ? 'تحديث' : 'حفظ'}
                </button>
                <button onClick={resetForm} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
