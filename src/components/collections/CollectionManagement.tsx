import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Installment, Policy, INSTALLMENT_STATUS_LABELS } from '../../types';
import { formatCurrency, formatDate, formatPercent } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Wallet, Plus, X, CheckCircle, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

type FilterType = 'all' | 'current_month' | 'pending' | 'overdue' | 'paid';

export default function CollectionManagement() {
  const { profile, activeBranch } = useAuth();
  const [installments, setInstallments] = useState<(Installment & { policy?: Policy })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [filter, setFilter] = useState<FilterType>('current_month');

  const [formData, setFormData] = useState({
    amount: '',
    collection_date: new Date().toISOString().split('T')[0],
    receipt_number: '',
    notes: '',
  });

  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const userRole = profile?.role;
      const userId = profile?.id;
      const branchId = activeBranch?.id;

      let query = supabase
        .from('installments')
        .select('*, policy:policies(policy_number, client_id, agent_id, annual_premium, first_year_end, team_leader_id, supervisor_id, branch_id, branch_manager_id, client:clients(name))')
        .order('due_date', { ascending: true });

      // تطبيق الفلاتر حسب الدور الوظيفي والهيكل الهرمي
      if (userRole === 'agent') {
        // الوكيل يرى أقساط عملائه فقط
        query = query.eq('policy.agent_id', userId);
      } else if (userRole === 'team_leader') {
        // رئيس المجموعة يرى أقساط نفسه وأعضاء فريقه
        query = query.or(`policy.agent_id.eq.${userId},policy.team_leader_id.eq.${userId}`);
      } else if (userRole === 'supervisor') {
        // المشرف يرى أقساط رؤساء المجموعات والوكلاء التابعين له
        query = query.eq('policy.supervisor_id', userId);
      } else if (userRole === 'general_supervisor') {
        // المشرف العام يرى أقساط فرعه بالكامل
        query = query.eq('policy.branch_id', branchId);
      }
      // Super Admin و Dev Manager يرون الكل بدون فلاتر

      const { data, error } = await query;

      if (error) {
        toast.error('خطأ في تحميل الأقساط: ' + error.message);
      } else if (data) {
        setInstallments(data as unknown as (Installment & { policy?: Policy })[]);
      }
    } catch (err) {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }, [profile, activeBranch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment || !profile) return;

    setFormError('');
    const amount = Number(formData.amount);

    if (!formData.amount.trim() || amount <= 0) {
      setFormError('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }

    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('collections').insert({
        installment_id: selectedInstallment.id,
        policy_id: selectedInstallment.policy_id,
        amount,
        collection_date: formData.collection_date,
        receipt_number: formData.receipt_number || null,
        collected_by: profile.id,
        notes: formData.notes || null,
        branch_id: (selectedInstallment.policy as any)?.branch_id
      });

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('installments')
        .update({
          status: 'paid',
          paid_date: formData.collection_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedInstallment.id);

      if (updateError) throw updateError;

      toast.success('تم تسجيل التحصيل بنجاح');
      resetForm();
      setShowForm(false);
      await loadData();
      
      // تحديث الداشبورد
      window.dispatchEvent(new CustomEvent('collectionUpdated', { 
        detail: { policyId: selectedInstallment.policy_id }
      }));
    } catch (err: any) {
      setFormError('خطأ: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedInstallment, profile, formData, loadData]);

  const revertCollection = async (installment: Installment) => {
    if (!confirm('هل أنت متأكد من التراجع عن هذا التحصيل؟')) return;
    
    try {
      const { error: deleteError } = await supabase
        .from('collections')
        .delete()
        .eq('installment_id', installment.id);
        
      if (deleteError) throw deleteError;
      
      const isOverdue = new Date(installment.due_date) < new Date();
      const { error: updateError } = await supabase
        .from('installments')
        .update({
          status: isOverdue ? 'overdue' : 'pending',
          paid_date: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', installment.id);
        
      if (updateError) throw updateError;
      
      toast.success('تم التراجع عن التحصيل بنجاح');
      loadData();
      
      // تحديث الداشبورد
      window.dispatchEvent(new CustomEvent('collectionUpdated', { 
        detail: { policyId: installment.policy_id }
      }));
    } catch (err: any) {
      toast.error('خطأ: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      amount: '',
      collection_date: new Date().toISOString().split('T')[0],
      receipt_number: '',
      notes: '',
    });
    setFormError('');
    setSelectedInstallment(null);
  };

  const filtered = installments.filter(inst => {
    if (filter === 'all') return true;
    if (filter === 'current_month') {
      const now = new Date();
      const dueDate = new Date(inst.due_date);
      return dueDate.getMonth() === now.getMonth() && dueDate.getFullYear() === now.getFullYear();
    }
    return inst.status === filter;
  });

  const stats = {
    total: installments.length,
    pending: installments.filter(i => i.status === 'pending').length,
    overdue: installments.filter(i => i.status === 'overdue').length,
    paid: installments.filter(i => i.status === 'paid').length,
    totalAmount: installments.reduce((s, i) => s + (i.amount || 0), 0),
    collectedAmount: installments.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0),
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="التحصيل"
        description="إدارة تحصيل الأقساط والدفعات"
        icon={Wallet}
        actions={
          <button onClick={() => { resetForm(); setShowForm(true); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl flex items-center gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> تحصيل جديد
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="الإجمالي" value={stats.total} color="blue" />
        <StatCard label="قيد الانتظار" value={stats.pending} color="amber" />
        <StatCard label="متأخر" value={stats.overdue} color="rose" />
        <StatCard label="مدفوع" value={stats.paid} color="emerald" />
        <StatCard label="نسبة التحصيل" value={formatPercent(stats.totalAmount > 0 ? (stats.collectedAmount / stats.totalAmount) * 100 : 0)} color="indigo" />
      </div>

      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
        {(['current_month', 'all', 'pending', 'overdue', 'paid'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {f === 'current_month' ? 'الشهر الحالي' : f === 'all' ? 'الكل' : f === 'pending' ? 'قيد الانتظار' : f === 'overdue' ? 'متأخر' : 'مدفوع'}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-right">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/50">
              <th className="px-6 py-4 text-sm font-bold">العميل / الوثيقة</th>
              <th className="px-6 py-4 text-sm font-bold">القسط</th>
              <th className="px-6 py-4 text-sm font-bold">المبلغ</th>
              <th className="px-6 py-4 text-sm font-bold">الاستحقاق</th>
              <th className="px-6 py-4 text-sm font-bold">الحالة</th>
              <th className="px-6 py-4 text-sm font-bold">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {filtered.map(inst => (
              <tr key={inst.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900 dark:text-white">{(inst.policy as any)?.client?.name}</p>
                  <p className="text-xs text-slate-500">الوثيقة: {(inst.policy as any)?.policy_number}</p>
                </td>
                <td className="px-6 py-4 text-sm">قسط #{inst.installment_number}</td>
                <td className="px-6 py-4 font-bold">{formatCurrency(inst.amount)}</td>
                <td className="px-6 py-4 text-sm">{formatDate(inst.due_date)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    inst.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                    inst.status === 'overdue' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {INSTALLMENT_STATUS_LABELS[inst.status]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {inst.status === 'paid' ? (
                    <button onClick={() => revertCollection(inst)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="تراجع">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => { setSelectedInstallment(inst); setShowForm(true); }} className="text-blue-600 hover:underline font-bold">تحصيل</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
              <h2 className="text-xl font-bold">تسجيل تحصيل</h2>
              <button onClick={() => setShowForm(false)}><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-sm border border-rose-100">{formError}</div>}
              <div>
                <label className="block text-sm font-bold mb-1">المبلغ</label>
                <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-3 border rounded-xl" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">تاريخ التحصيل</label>
                <input type="date" value={formData.collection_date} onChange={e => setFormData({...formData, collection_date: e.target.value})} className="w-full p-3 border rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">رقم الإيصال</label>
                <input type="text" value={formData.receipt_number} onChange={e => setFormData({...formData, receipt_number: e.target.value})} className="w-full p-3 border rounded-xl" />
              </div>
              <button type="submit" disabled={submitting} className="w-full p-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
                {submitting ? 'جاري التسجيل...' : 'تأكيد التحصيل'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  };
  return (
    <div className={`p-4 rounded-2xl border shadow-sm ${colors[color]}`}>
      <p className="text-xs font-bold uppercase mb-1 opacity-70">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
