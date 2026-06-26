import { useEffect, useState } from 'react';
import { supabase, type Target, type User, ROLE_LABELS, type UserRole } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import { Target as TargetIcon, Plus, Pencil, Trash2, X, Check, Search, UserCircle, Calendar, TrendingUp } from 'lucide-react';

export default function TargetsPage({ showSuccess, showError }: PageProps) {
  const { user: currentUser } = useAuthContext();
  const [targets, setTargets] = useState<Target[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    user_id: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    target_amount: 0,
    target_policies: 0,
  });

  useEffect(() => {
    fetchTargets();
    fetchUsers();
  }, []);

  const fetchTargets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('targets')
      .select('*, users(full_name, role)')
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    setTargets((data as unknown as Target[]) || []);
    setLoading(false);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('users').select('*').eq('is_active', true);
    setUsers((data as User[]) || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        target_amount: Number(formData.target_amount),
        target_policies: Number(formData.target_policies),
      };
      if (editingTarget) {
        const { error } = await supabase.from('targets').update(payload).eq('id', editingTarget.id);
        if (error) throw error;
        showSuccess('تم تحديث التارجت بنجاح');
      } else {
        const { error } = await supabase.from('targets').insert(payload);
        if (error) throw error;
        showSuccess('تم إنشاء التارجت بنجاح');
      }
      setShowForm(false);
      setEditingTarget(null);
      setFormData({ user_id: '', year: new Date().getFullYear(), month: new Date().getMonth() + 1, target_amount: 0, target_policies: 0 });
      fetchTargets();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleEdit = (t: Target) => {
    setEditingTarget(t);
    setFormData({
      user_id: t.user_id,
      year: t.year,
      month: t.month,
      target_amount: t.target_amount,
      target_policies: t.target_policies,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التارجت؟')) return;
    try {
      const { error } = await supabase.from('targets').delete().eq('id', id);
      if (error) throw error;
      showSuccess('تم حذف التارجت بنجاح');
      fetchTargets();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const filteredTargets = targets.filter((t) =>
    (t as unknown as { users?: { full_name: string } }).users?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getProgressColor = (achieved: number, target: number) => {
    const pct = target > 0 ? (achieved / target) * 100 : 0;
    if (pct >= 100) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const canManageTargets = currentUser?.role && ['super_admin', 'dev_manager', 'general_supervisor'].includes(currentUser.role);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">التارجتات</h2>
          <p className="page-subtitle">إدارة الأهداف والتارجتات</p>
        </div>
        {canManageTargets && (
          <button
            onClick={() => { setShowForm(true); setEditingTarget(null); setFormData({ user_id: '', year: new Date().getFullYear(), month: new Date().getMonth() + 1, target_amount: 0, target_policies: 0 }); }}
            className="btn-primary hidden sm:inline-flex"
          >
            <Plus className="w-5 h-5" />
            تارجت جديد
          </button>
        )}
      </div>

      {/* Search */}
      <div className="search-bar">
        <Search className="search-bar-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث..."
          className="input-field"
        />
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredTargets.length === 0 ? (
          <div className="empty-state">
            <TargetIcon className="empty-state-icon" />
            <p>لا توجد تارجتات</p>
          </div>
        ) : (
          filteredTargets.map((t) => {
            const u = (t as unknown as { users?: { full_name: string; role: UserRole } }).users;
            const amountPct = t.target_amount > 0 ? Math.min((t.achieved_amount / t.target_amount) * 100, 100) : 0;
            return (
              <div key={t.id} className="card-hover">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                    <UserCircle className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{u?.full_name || '-'}</p>
                    <p className="text-xs text-slate-500">{u?.role ? ROLE_LABELS[u.role as UserRole] : '-'}</p>
                  </div>
                  <span className={`badge ${amountPct >= 100 ? 'badge-success' : amountPct >= 50 ? 'badge-warning' : 'badge-danger'}`}>
                    {amountPct.toFixed(0)}%
                  </span>
                </div>

                <div className="space-y-3 mb-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {t.year} / {t.month}
                    </span>
                    <span className="font-bold text-slate-900">{t.target_amount.toLocaleString()}</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">الإنجاز المالي</span>
                      <span className="font-bold">{t.achieved_amount.toLocaleString()} / {t.target_amount.toLocaleString()}</span>
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-bar-fill ${getProgressColor(t.achieved_amount, t.target_amount)}`} style={{ width: `${Math.min(amountPct, 100)}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      الوثائق
                    </span>
                    <span className="font-bold text-slate-900">{t.achieved_policies} / {t.target_policies}</span>
                  </div>
                </div>

                {canManageTargets && (
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                    <button onClick={() => handleEdit(t)} className="action-btn-edit flex-1">
                      <Pencil className="w-4 h-4" />
                      تعديل
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="action-btn-delete flex-1">
                      <Trash2 className="w-4 h-4" />
                      حذف
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : filteredTargets.length === 0 ? (
          <div className="empty-state">
            <TargetIcon className="empty-state-icon" />
            <p>لا توجد تارجتات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">المستخدم</th>
                  <th className="table-header">السنة/الشهر</th>
                  <th className="table-header">التارجت المالي</th>
                  <th className="table-header">التحقق المالي</th>
                  <th className="table-header">تارجت الوثائق</th>
                  <th className="table-header">التحقق</th>
                  <th className="table-header">نسبة الإنجاز</th>
                  {canManageTargets && <th className="table-header">الإجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {filteredTargets.map((t) => {
                  const u = (t as unknown as { users?: { full_name: string; role: UserRole } }).users;
                  const amountPct = t.target_amount > 0 ? Math.min((t.achieved_amount / t.target_amount) * 100, 100) : 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell font-medium">{u?.full_name || '-'}</td>
                      <td className="table-cell">{t.year} / {t.month}</td>
                      <td className="table-cell">{t.target_amount.toLocaleString()}</td>
                      <td className="table-cell">{t.achieved_amount.toLocaleString()}</td>
                      <td className="table-cell">{t.target_policies}</td>
                      <td className="table-cell">{t.achieved_policies}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${getProgressColor(t.achieved_amount, t.target_amount)} rounded-full`} style={{ width: `${Math.min(amountPct, 100)}%` }} />
                          </div>
                          <span className="text-xs font-bold">{amountPct.toFixed(0)}%</span>
                        </div>
                      </td>
                      {canManageTargets && (
                        <td className="table-cell">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEdit(t)} className="action-btn-edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(t.id)} className="action-btn-delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Button (Mobile) */}
      {canManageTargets && (
        <button
          onClick={() => { setShowForm(true); setEditingTarget(null); setFormData({ user_id: '', year: new Date().getFullYear(), month: new Date().getMonth() + 1, target_amount: 0, target_policies: 0 }); }}
          className="fab"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Bottom Sheet Form (Mobile) */}
      {showForm && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowForm(false)} />
          <div className="bottom-sheet sm:static sm:inset-auto sm:bottom-auto sm:bg-transparent sm:shadow-none sm:rounded-none sm:z-auto sm:max-h-none sm:overflow-visible">
            <div className="p-5 sm:p-0 space-y-4">
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingTarget ? 'تعديل تارجت' : 'تارجت جديد'}</h3>
                <button onClick={() => setShowForm(false)} className="btn-icon">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">المستخدم *</label>
                  <select value={formData.user_id} onChange={(e) => setFormData({ ...formData, user_id: e.target.value })} className="input-field" required>
                    <option value="">اختر المستخدم</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} - {ROLE_LABELS[u.role as UserRole]}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">السنة *</label>
                    <input type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })} className="input-field" required />
                  </div>
                  <div>
                    <label className="label">الشهر *</label>
                    <select value={formData.month} onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })} className="input-field" required>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">التارجت المالي *</label>
                  <input type="number" min={0} step="0.01" value={formData.target_amount} onChange={(e) => setFormData({ ...formData, target_amount: Number(e.target.value) })} className="input-field" required />
                </div>
                <div>
                  <label className="label">تارجت عدد الوثائق *</label>
                  <input type="number" min={0} value={formData.target_policies} onChange={(e) => setFormData({ ...formData, target_policies: Number(e.target.value) })} className="input-field" required />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button type="submit" className="btn-primary flex-1">
                    <Check className="w-5 h-5" />
                    {editingTarget ? 'حفظ' : 'إنشاء'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
