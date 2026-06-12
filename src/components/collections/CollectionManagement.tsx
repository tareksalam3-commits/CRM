import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Installment, Policy, Collection as CollectionType } from '../../types';
import { formatCurrency, formatDate, formatPercent } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Wallet, Plus, X, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CollectionManagement() {
  const { profile } = useAuth();
  const [installments, setInstallments] = useState<(Installment & { policy: Policy })[]>([]);
  const [collections, setCollections] = useState<CollectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');

  const [formData, setFormData] = useState({
    amount: '', collection_date: new Date().toISOString().split('T')[0], receipt_number: '', notes: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [instRes, collRes] = await Promise.all([
      supabase.from('installments').select('*, policy:policies(policy_number, client_id, agent_id, annual_premium, client:clients(name))').order('due_date'),
      supabase.from('collections').select('*').order('collection_date', { ascending: false }),
    ]);
    if (instRes.data) setInstallments(instRes.data as any);
    if (collRes.data) setCollections(collRes.data);
    setLoading(false);
  }

  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstallment || !profile) return;

    const { error } = await supabase.from('collections').insert({
      installment_id: selectedInstallment.id,
      policy_id: selectedInstallment.policy_id,
      amount: Number(formData.amount),
      collection_date: formData.collection_date,
      receipt_number: formData.receipt_number || null,
      collected_by: profile.id,
      notes: formData.notes || null,
    });

    if (error) { toast.error('خطأ في تسجيل التحصيل'); return; }

    await supabase.from('installments').update({ status: 'paid', paid_date: formData.collection_date, updated_at: new Date().toISOString() }).eq('id', selectedInstallment.id);

    toast.success('تم تسجيل التحصيل بنجاح');
    setShowForm(false);
    setSelectedInstallment(null);
    setFormData({ amount: '', collection_date: new Date().toISOString().split('T')[0], receipt_number: '', notes: '' });
    loadData();
  }

  function openCollectForm(inst: Installment) {
    setSelectedInstallment(inst);
    setFormData({ ...formData, amount: String(inst.amount) });
    setShowForm(true);
  }

  const totalOverdue = installments.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.amount), 0);
  const totalCollected = collections.reduce((s, c) => s + Number(c.amount), 0);
  const totalRequired = installments.reduce((s, i) => s + Number(i.amount), 0);
  const collectionRate = totalRequired > 0 ? (totalCollected / totalRequired) * 100 : 0;

  const filtered = installments.filter(i => filter === 'all' || i.status === filter);

  const statusIcons: Record<string, typeof CheckCircle> = { paid: CheckCircle, pending: Clock, overdue: AlertTriangle };
  const statusColors: Record<string, string> = {
    paid: 'text-emerald-600 dark:text-emerald-400', pending: 'text-amber-600 dark:text-amber-400', overdue: 'text-red-600 dark:text-red-400',
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="إدارة التحصيل" description="متابعة تحصيل أقساط السنة الأولى" icon={Wallet} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">إجمالي المطلوب</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{formatCurrency(totalRequired)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">المحصل</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">المتأخر</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">{formatCurrency(totalOverdue)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">نسبة التحصيل</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">{formatPercent(collectionRate)}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {[
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'مستحقة' },
          { key: 'overdue', label: 'متأخرة' },
          { key: 'paid', label: 'محصلة' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key as any)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${filter === tab.key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Installments List */}
      <div className="space-y-3">
        {filtered.map(inst => {
          const Icon = statusIcons[inst.status];
          return (
            <div key={inst.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${statusColors[inst.status]}`} />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {(inst.policy as any)?.policy_number} - القسط {inst.installment_number}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{(inst.policy as any)?.client?.name}</span>
                      <span>|</span>
                      <span>استحقاق: {formatDate(inst.due_date)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mr-auto sm:mr-0">
                  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(inst.amount)}</span>
                  {inst.status !== 'paid' && (
                    <button
                      onClick={() => openCollectForm(inst)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
                    >
                      <Plus className="w-3 h-3" /> تحصيل
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12 text-slate-400">لا توجد أقساط</div>}
      </div>

      {/* Collection Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">تسجيل تحصيل</h3>
              <button onClick={() => { setShowForm(false); setSelectedInstallment(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleCollect} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المبلغ</label>
                <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ التحصيل</label>
                <input type="date" value={formData.collection_date} onChange={(e) => setFormData({ ...formData, collection_date: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">رقم الإيصال</label>
                <input type="text" value={formData.receipt_number} onChange={(e) => setFormData({ ...formData, receipt_number: e.target.value })} dir="ltr" className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ملاحظات</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">تأكيد التحصيل</button>
                <button type="button" onClick={() => { setShowForm(false); setSelectedInstallment(null); }} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
