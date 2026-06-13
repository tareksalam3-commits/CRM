import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Target as TargetType, TARGET_PERIOD_LABELS, ROLE_LABELS, TargetPeriod, Profile } from '../../types';
import { canManageTargets } from '../../lib/rbac';
import { formatCurrency } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Target, Plus, X, TrendingUp, TrendingDown, Edit2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

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

interface EnrichedTarget extends TargetType {
  user?: Pick<Profile, 'full_name' | 'role'>;
  achieved?: number;
}

export default function TargetManagement() {
  const { profile } = useAuth();
  const [targets, setTargets] = useState<EnrichedTarget[]>([]);
  const [users, setUsers] = useState<Pick<Profile, 'id' | 'full_name' | 'role'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EnrichedTarget | null>(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterPeriodType, setFilterPeriodType] = useState<TargetPeriod | ''>('monthly');

  const [form, setForm] = useState({
    user_id: '', period_type: 'monthly' as TargetPeriod,
    year: new Date().getFullYear(), period_number: new Date().getMonth() + 1, target_amount: '',
  });

  const canManage = profile ? canManageTargets(profile.role) : false;

  const loadData = useCallback(async () => {
    let tQuery = supabase
      .from('targets')
      .select('*, user:profiles(full_name, role)')
      .order('year', { ascending: false })
      .order('period_number', { ascending: false });

    if (filterYear) tQuery = tQuery.eq('year', filterYear);
    if (filterPeriodType) tQuery = tQuery.eq('period_type', filterPeriodType);

    const [targetsRes, usersRes, policiesRes] = await Promise.all([
      tQuery,
      supabase.from('profiles').select('id, full_name, role').eq('is_active', true).order('role').order('full_name'),
      supabase.from('policies').select('agent_id, annual_premium, created_at'),
    ]);

    const pList = policiesRes.data || [];
    const enriched: EnrichedTarget[] = (targetsRes.data || []).map((t) => {
      const { start, end } = getPeriodDateRange(t.period_type as TargetPeriod, t.year, t.period_number);
      const achieved = pList
        .filter(p => p.agent_id === t.user_id && p.created_at >= start && p.created_at < end)
        .reduce((s, p) => s + Number(p.annual_premium), 0);
      return { ...t, achieved } as EnrichedTarget;
    });

    setTargets(enriched);
    if (usersRes.data) setUsers(usersRes.data);
    setLoading(false);
  }, [filterYear, filterPeriodType]);

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
  }

  function resetForm() { setShowForm(false); setEditingTarget(null); setForm({ user_id: '', period_type: 'monthly', year: new Date().getFullYear(), period_number: new Date().getMonth() + 1, target_amount: '' }); }

  function startEdit(t: EnrichedTarget) {
    setEditingTarget(t);
    setForm({ user_id: t.user_id, period_type: t.period_type, year: t.year, period_number: t.period_number, target_amount: String(t.target_amount) });
    setShowForm(true);
  }

  const totalTarget = targets.reduce((s, t) => s + t.target_amount, 0);
  const totalAchieved = targets.reduce((s, t) => s + (t.achieved || 0), 0);
  const overallPct = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

  if (loading) return <LoadingSpinner />;

  const periodNumbers = form.period_type === 'monthly' ? 12
    : form.period_type === 'quarterly' ? 4
    : form.period_type === 'semi_annual' ? 2 : 1;

  return (
    <div>
      <PageHeader
        title="إدارة التارجتات"
        description={`${targets.length} تارجت`}
        icon={Target}
        actions={canManage ? (
          <button onClick={() => { setEditingTarget(null); resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">إضافة تارجت</span>
          </button>
        ) : undefined}
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'إجمالي التارجت', value: formatCurrency(totalTarget), icon: Target, color: 'text-blue-600' },
          { label: 'إجمالي المحقق', value: formatCurrency(totalAchieved), icon: TrendingUp, color: 'text-emerald-600' },
          { label: 'نسبة الإنجاز', value: `${overallPct.toFixed(1)}%`, icon: overallPct >= 80 ? TrendingUp : TrendingDown, color: overallPct >= 80 ? 'text-emerald-600' : 'text-red-600' },
        ].map((k, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-700 flex items-center justify-center ${k.color}`}>
              <k.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
              <p className="font-bold text-slate-900 dark:text-white">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={filterYear} onChange={e => { setFilterYear(Number(e.target.value)); }} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterPeriodType} onChange={e => setFilterPeriodType(e.target.value as TargetPeriod | '')} className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">كل الفترات</option>
          {(Object.entries(TARGET_PERIOD_LABELS) as [TargetPeriod, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Targets list */}
      <div className="space-y-3">
        {targets.map(t => {
          const pct = t.target_amount > 0 ? Math.min(((t.achieved || 0) / t.target_amount) * 100, 100) : 0;
          const userObj = t.user as { full_name: string; role: string } | undefined;
          return (
            <div key={t.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{userObj?.full_name || '—'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {userObj?.role ? ROLE_LABELS[userObj.role as keyof typeof ROLE_LABELS] : ''} — {TARGET_PERIOD_LABELS[t.period_type]} {t.period_number}/{t.year}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canManage && (
                    <>
                      <button onClick={() => startEdit(t)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-slate-500" /></button>
                      <button onClick={() => deleteTarget(t.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-600 dark:text-slate-400">التارجت: <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(t.target_amount)}</span></span>
                <span className="text-slate-600 dark:text-slate-400">المحقق: <span className={`font-medium ${(t.achieved || 0) >= t.target_amount ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>{formatCurrency(t.achieved || 0)}</span></span>
                <span className={`font-bold ${pct >= 100 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-500'}`}>{pct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {targets.length === 0 && (
          <div className="text-center py-16 text-slate-400"><Target className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>لا توجد تارجتات</p></div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingTarget ? 'تعديل التارجت' : 'إضافة تارجت'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الموظف</label>
                <select value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option value="">اختر موظف</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} — {ROLE_LABELS[u.role]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">نوع الفترة</label>
                  <select value={form.period_type} onChange={e => setForm({ ...form, period_type: e.target.value as TargetPeriod, period_number: 1 })} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {(Object.entries(TARGET_PERIOD_LABELS) as [TargetPeriod, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">رقم الفترة</label>
                  <select value={form.period_number} onChange={e => setForm({ ...form, period_number: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {Array.from({ length: periodNumbers }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
                  <select value={form.year} onChange={e => setForm({ ...form, year: Number(e.target.value) })} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">مبلغ التارجت</label>
                  <input type="number" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" dir="ltr" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSubmit} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors">{editingTarget ? 'تحديث' : 'حفظ'}</button>
                <button onClick={resetForm} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium transition-colors">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
