import { useEffect, useState } from 'react';
import { supabase, type MonthlyClosing } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';
import type { PageProps } from '../types';
import { CalendarCheck, Plus, X, Lock, Receipt, FileText, UserCircle, Calendar, Clock } from 'lucide-react';

export default function MonthlyClosingPage({ showSuccess, showError }: PageProps) {
  const { user: currentUser } = useAuthContext();
  const [closings, setClosings] = useState<MonthlyClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, notes: '' });

  useEffect(() => {
    fetchClosings();
  }, []);

  const fetchClosings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('monthly_closings')
      .select('*, users(full_name)')
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    setClosings((data as unknown as MonthlyClosing[]) || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const startDate = `${formData.year}-${String(formData.month).padStart(2, '0')}-01`;
      const endDate = `${formData.year}-${String(formData.month).padStart(2, '0')}-31`;

      const { data: collectionsData } = await supabase
        .from('collections')
        .select('amount')
        .gte('collection_date', startDate)
        .lte('collection_date', endDate);

      const { count: policiesCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      const totalCollections = collectionsData?.reduce((sum, c) => sum + (c.amount || 0), 0) || 0;

      const { error } = await supabase.from('monthly_closings').insert({
        year: formData.year,
        month: formData.month,
        closed_by: currentUser?.id,
        total_collections: totalCollections,
        total_policies: policiesCount || 0,
        notes: formData.notes || null,
      });

      if (error) throw error;
      showSuccess('تم التقفيل بنجاح');
      setShowForm(false);
      setFormData({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, notes: '' });
      fetchClosings();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">تقفيل الشهر</h2>
          <p className="page-subtitle">إغلاق الشهر وتحديد النتائج</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setFormData({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, notes: '' }); }}
          className="btn-primary hidden sm:inline-flex"
        >
          <Plus className="w-5 h-5" />
          تقفيل جديد
        </button>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : closings.length === 0 ? (
          <div className="empty-state">
            <CalendarCheck className="empty-state-icon" />
            <p>لا يوجد تقفيلات شهرية</p>
          </div>
        ) : (
          closings.map((c) => (
            <div key={c.id} className="card-hover">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{c.year} / {c.month}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(c.closed_at).toLocaleDateString('ar-EG')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="stat-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs text-slate-500">إجمالي التحصيل</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{c.total_collections.toLocaleString()}</p>
                </div>
                <div className="stat-card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-sky-600" />
                    <span className="text-xs text-slate-500">إجمالي الوثائق</span>
                  </div>
                  <p className="text-lg font-bold text-slate-900">{c.total_policies}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-600 pt-3 border-t border-slate-100">
                <UserCircle className="w-4 h-4 text-slate-400" />
                {(c as unknown as { users?: { full_name: string } }).users?.full_name || '-'}
              </div>

              {c.notes && (
                <p className="text-sm text-slate-500 mt-2 bg-slate-50 p-2 rounded-lg">{c.notes}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : closings.length === 0 ? (
          <div className="empty-state">
            <CalendarCheck className="empty-state-icon" />
            <p>لا يوجد تقفيلات شهرية</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">السنة/الشهر</th>
                  <th className="table-header">إجمالي التحصيل</th>
                  <th className="table-header">إجمالي الوثائق</th>
                  <th className="table-header">تم الإغلاق بواسطة</th>
                  <th className="table-header">تاريخ الإغلاق</th>
                  <th className="table-header">ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="table-cell font-medium">{c.year} / {c.month}</td>
                    <td className="table-cell">{c.total_collections.toLocaleString()}</td>
                    <td className="table-cell">{c.total_policies}</td>
                    <td className="table-cell">{(c as unknown as { users?: { full_name: string } }).users?.full_name || '-'}</td>
                    <td className="table-cell">{new Date(c.closed_at).toLocaleDateString('ar-EG')}</td>
                    <td className="table-cell">{c.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => { setShowForm(true); setFormData({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, notes: '' }); }}
        className="fab"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Bottom Sheet Form (Mobile) */}
      {showForm && (
        <>
          <div className="bottom-sheet-overlay" onClick={() => setShowForm(false)} />
          <div className="bottom-sheet sm:static sm:inset-auto sm:bottom-auto sm:bg-transparent sm:shadow-none sm:rounded-none sm:z-auto sm:max-h-none sm:overflow-visible">
            <div className="p-5 sm:p-0 space-y-4">
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">تقفيل شهر جديد</h3>
                <button onClick={() => setShowForm(false)} className="btn-icon">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
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
                  <label className="label">ملاحظات</label>
                  <input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="input-field" />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button type="submit" className="btn-primary flex-1">
                    <Lock className="w-5 h-5" />
                    تأكيد التقفيل
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
