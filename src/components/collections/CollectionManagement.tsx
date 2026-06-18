import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Installment, Policy, INSTALLMENT_STATUS_LABELS } from '../../types';
import { formatCurrency, formatDate, formatPercent } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Wallet, Plus, X, CheckCircle, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

type FilterType = 'all' | 'pending' | 'overdue' | 'paid';

export default function CollectionManagement() {
  const { profile } = useAuth();
  const [installments, setInstallments] = useState<(Installment & { policy?: Policy })[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

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
      const { data, error } = await supabase
        .from('installments')
        .select('*, policy:policies(policy_number, client_id, agent_id, annual_premium, client:clients(name))')
        .order('due_date', { ascending: true });

      if (error) {
        console.error('Error loading installments:', error);
        toast.error('خطأ في تحميل الأقساط: ' + error.message);
      } else if (data) {
        setInstallments(data as unknown as (Installment & { policy?: Policy })[]);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment || !profile) return;

    setFormError('');
    const amount = Number(formData.amount);

    if (!formData.amount.trim()) {
      setFormError('المبلغ مطلوب');
      return;
    }

    if (amount <= 0) {
      setFormError('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }

    if (amount > selectedInstallment.amount) {
      setFormError(`المبلغ لا يمكن أن يتجاوز ${formatCurrency(selectedInstallment.amount)}`);
      return;
    }

    if (!formData.collection_date) {
      setFormError('تاريخ التحصيل مطلوب');
      return;
    }

    setSubmitting(true);

    try {
      const { data: existing, error: checkError } = await supabase
        .from('collections')
        .select('id', { count: 'exact', head: true })
        .eq('installment_id', selectedInstallment.id);

      if (checkError) {
        setFormError('خطأ في التحقق من التحصيل السابق');
        setSubmitting(false);
        return;
      }

      if (existing && existing.length > 0) {
        setFormError('هذا القسط تم تحصيله مسبقاً');
        setSubmitting(false);
        return;
      }

      const { error: insertError } = await supabase.from('collections').insert({
        installment_id: selectedInstallment.id,
        policy_id: selectedInstallment.policy_id,
        amount,
        collection_date: formData.collection_date,
        receipt_number: formData.receipt_number || null,
        collected_by: profile.id,
        notes: formData.notes || null,
      });

      if (insertError) {
        setFormError('خطأ في تسجيل التحصيل: ' + insertError.message);
        setSubmitting(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('installments')
        .update({
          status: amount >= selectedInstallment.amount ? 'paid' : 'pending',
          paid_date: amount >= selectedInstallment.amount ? formData.collection_date : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedInstallment.id);

      if (updateError) {
        console.error('Failed to update installment:', updateError);
        toast.error('تم تسجيل التحصيل لكن حدث خطأ في تحديث الحالة');
      } else {
        toast.success('تم تسجيل التحصيل بنجاح');
      }

      resetForm();
      setShowForm(false);
      await loadData();
    } catch (err) {
      setFormError('حدث خطأ غير متوقع: ' + String(err));
      console.error('Submission error:', err);
    } finally {
      setSubmitting(false);
    }
  }, [selectedInstallment, profile, formData, loadData]);

  const revertCollection = async (installment: Installment) => {
    if (!confirm('هل أنت متأكد من التراجع عن هذا التحصيل؟ سيتم حذف سجل التحصيل وإعادة القسط لحالة غير مدفوع.')) return;
    
    try {
      // 1. Delete the collection record
      const { error: deleteError } = await supabase
        .from('collections')
        .delete()
        .eq('installment_id', installment.id);
        
      if (deleteError) {
        toast.error('خطأ في حذف سجل التحصيل: ' + deleteError.message);
        return;
      }
      
      // 2. Determine new status based on due date
      const isOverdue = new Date(installment.due_date) < new Date();
      const newStatus = isOverdue ? 'overdue' : 'pending';
      
      // 3. Update the installment status
      const { error: updateError } = await supabase
        .from('installments')
        .update({
          status: newStatus,
          paid_date: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', installment.id);
        
      if (updateError) {
        toast.error('تم حذف التحصيل ولكن حدث خطأ في تحديث حالة القسط');
        return;
      }
      
      toast.success('تم التراجع عن التحصيل بنجاح');
      loadData();
    } catch (err) {
      console.error('Revert error:', err);
      toast.error('حدث خطأ غير متوقع أثناء التراجع');
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

  if (loading) {
    return (
      <>
        <PageHeader
          title="التحصيل"
          description="إدارة تحصيل الأقساط والدفعات"
          icon={Wallet}
        />
        <LoadingSpinner />
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="التحصيل"
        description="إدارة تحصيل الأقساط والدفعات"
        icon={Wallet}
        actions={
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            تحصيل جديد
          </button>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="الإجمالي" value={stats.total} variant="neutral" />
        <StatCard label="قيد الانتظار" value={stats.pending} variant="warning" />
        <StatCard label="متأخر" value={stats.overdue} variant="danger" />
        <StatCard label="مدفوع" value={stats.paid} variant="success" />
        <StatCard label="معدل التحصيل" value={formatPercent(stats.totalAmount > 0 ? (stats.collectedAmount / stats.totalAmount) * 100 : 0)} variant="neutral" />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {(['all', 'pending', 'overdue', 'paid'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {f === 'all' ? 'الكل' : f === 'pending' ? 'قيد الانتظار' : f === 'overdue' ? 'متأخر' : 'مدفوع'}
          </button>
        ))}
      </div>

      {/* Installments Table */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Wallet className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">لا توجد أقساط {filter === 'all' ? '' : `بحالة "${INSTALLMENT_STATUS_LABELS[filter] || filter}"`}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">رقم الوثيقة</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">القسط</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">المبلغ</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">تاريخ الاستحقاق</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">الحالة</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filtered.map(inst => (
                  <tr key={inst.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-white font-medium">
                      {(inst.policy as unknown as Policy)?.policy_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">#{inst.installment_number}</td>
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-white font-semibold">{formatCurrency(inst.amount)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{formatDate(inst.due_date)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inst.status} />
                    </td>
                    <td className="px-6 py-4">
                      {inst.status === 'paid' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">مدفوع</span>
                          <button
                            onClick={() => revertCollection(inst)}
                            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 rounded-lg transition-colors"
                            title="التراجع عن التحصيل"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedInstallment(inst);
                            setShowForm(true);
                          }}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          تحصيل
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collection Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">تحصيل قسط</h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {selectedInstallment && (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                  <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">الوثيقة:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {(selectedInstallment.policy as unknown as Policy)?.policy_number}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">المبلغ:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(selectedInstallment.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">الاستحقاق:</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {formatDate(selectedInstallment.due_date)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {formError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">المبلغ المتحصل</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">تاريخ التحصيل</label>
                <input
                  type="date"
                  value={formData.collection_date}
                  onChange={(e) => setFormData({ ...formData, collection_date: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">رقم الإيصال (اختياري)</label>
                <input
                  type="text"
                  value={formData.receipt_number}
                  onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="مثال: RCP-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">ملاحظات (اختياري)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder="ملاحظات إضافية..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                >
                  {submitting ? 'جاري التحصيل...' : 'تسجيل التحصيل'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg font-medium transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
    paid: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', icon: CheckCircle },
    pending: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', icon: Clock },
    overdue: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle },
  };

  const config = colors[status] || colors.pending;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {INSTALLMENT_STATUS_LABELS[status as keyof typeof INSTALLMENT_STATUS_LABELS] || status}
    </span>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant: 'neutral' | 'warning' | 'danger' | 'success';
}) {
  const colors = {
    neutral: 'bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white',
    warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-400',
    danger: 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-400',
    success: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-400',
  };

  return (
    <div className={`rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center ${colors[variant]}`}>
      <p className="text-xs opacity-75 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
