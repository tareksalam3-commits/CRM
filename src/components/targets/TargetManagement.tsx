import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Target as TargetType, TARGET_PERIOD_LABELS, ROLE_LABELS, TargetPeriod } from '../../types';
import { formatCurrency, formatPercent } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Target, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TargetManagement() {
  const { profile } = useAuth();
  const [targets, setTargets] = useState<(TargetType & { user?: { full_name: string; role: string } })[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [productions, setProductions] = useState<Record<string, number>>({});

  const [formData, setFormData] = useState({
    user_id: '', period_type: 'monthly' as TargetPeriod, year: new Date().getFullYear(), period_number: new Date().getMonth() + 1, target_amount: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [targetsRes, usersRes, policiesRes] = await Promise.all([
      supabase.from('targets').select('*, user:profiles(full_name, role)').order('year', { ascending: false }).order('period_number', { ascending: false }),
      supabase.from('profiles').select('id, full_name, role').eq('is_active', true),
      supabase.from('policies').select('agent_id, annual_premium, created_at'),
    ]);

    if (targetsRes.data) setTargets(targetsRes.data as any);
    if (usersRes.data) setUsers(usersRes.data);

    const prods: Record<string, number> = {};
    (policiesRes.data || []).forEach((p: any) => {
      prods[p.agent_id] = (prods[p.agent_id] || 0) + Number(p.annual_premium);
    });
    setProductions(prods);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('targets').upsert({
      user_id: formData.user_id,
      period_type: formData.period_type,
      year: formData.year,
      period_number: formData.period_number,
      target_amount: Number(formData.target_amount),
    }, { onConflict: 'user_id,period_type,year,period_number' });

    if (error) { toast.error('خطأ في حفظ التارجت'); return; }
    toast.success('تم حفظ التارجت');
    setShowForm(false);
    setFormData({ user_id: '', period_type: 'monthly', year: new Date().getFullYear(), period_number: new Date().getMonth() + 1, target_amount: '' });
    loadData();
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="إدارة التارجتات" description="المستهدفات والإنجاز" icon={Target}
        actions={
          profile?.role !== 'agent' ? (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">تعيين تارجت</span>
            </button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {targets.map(target => {
          const achieved = productions[target.user_id] || 0;
          const rate = target.target_amount > 0 ? (achieved / target.target_amount) * 100 : 0;
          const remaining = target.target_amount - achieved;

          return (
            <div key={target.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{(target.user as any)?.full_name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {(target.user as any)?.role && ROLE_LABELS[(target.user as any).role as keyof typeof ROLE_LABELS]} - {TARGET_PERIOD_LABELS[target.period_type]} {target.year}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {rate >= 100 ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><TrendingUp className="w-4 h-4" /> تحقق</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><TrendingDown className="w-4 h-4" /> {formatPercent(rate)}</span>
                  )}
                </div>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                <div className={`h-full rounded-full transition-all ${rate >= 100 ? 'bg-emerald-500' : rate >= 70 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(rate, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>المستهدف: {formatCurrency(target.target_amount)}</span>
                <span>المحقق: {formatCurrency(achieved)}</span>
                <span>المتبقي: {formatCurrency(Math.max(remaining, 0))}</span>
              </div>
            </div>
          );
        })}
        {targets.length === 0 && <div className="text-center py-12 text-slate-400">لا توجد تارجتات محددة</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تعيين تارجت</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المستخدم</label>
                <select value={formData.user_id} onChange={(e) => setFormData({ ...formData, user_id: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">اختر</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name} - {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">نوع الفترة</label>
                <select value={formData.period_type} onChange={(e) => setFormData({ ...formData, period_type: e.target.value as TargetPeriod })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  {Object.entries(TARGET_PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">السنة</label>
                  <input type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">رقم الفترة</label>
                  <input type="number" value={formData.period_number} onChange={(e) => setFormData({ ...formData, period_number: Number(e.target.value) })} min={1} max={12} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المبلغ المستهدف</label>
                <input type="number" value={formData.target_amount} onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">حفظ</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
