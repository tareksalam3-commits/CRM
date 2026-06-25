import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, Table, Badge, Button, Modal, Input, Select } from '../components/ui';
import type { Collection, Policy } from '../types/database';
import { COLLECTION_STATUS_LABELS } from '../types/database';
import { CreditCard, CheckCircle, AlertTriangle, Search, RotateCcw } from 'lucide-react';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [paymentData, setPaymentData] = useState({
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    receipt_number: '',
    notes: '',
  });

  useEffect(() => {
    fetchCollections();
  }, [search, statusFilter]);

  const fetchCollections = async () => {
    setLoading(true);
    let query = supabase
      .from('collections')
      .select('*, policy:policies(policy_number, policy_type), client:clients(full_name, mobile), agent:profiles(full_name), branch:branches(name)')
      .order('due_date', { ascending: true });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setCollections(data);
    }
    setLoading(false);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollection) return;

    const { error } = await supabase
      .from('collections')
      .update({
        status: 'paid',
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        receipt_number: paymentData.receipt_number || null,
        notes: paymentData.notes || null,
      })
      .eq('id', selectedCollection.id);

    if (!error) {
      setShowPaymentModal(false);
      fetchCollections();
    }
  };

  const openPaymentModal = (collection: Collection) => {
    setSelectedCollection(collection);
    setPaymentData({
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      receipt_number: '',
      notes: '',
    });
    setShowPaymentModal(true);
  };

  const reversePayment = async (collection: Collection) => {
    if (!confirm('هل أنت متأكد من التراجع عن عملية التحصيل؟')) return;

    const { error } = await supabase
      .from('collections')
      .update({
        status: 'pending',
        payment_date: null,
        payment_method: null,
        receipt_number: null,
        notes: null,
      })
      .eq('id', collection.id);

    if (!error) {
      fetchCollections();
    }
  };

  const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    paid: 'success',
    pending: 'warning',
    overdue: 'danger',
    cancelled: 'default',
  };

  const columns = [
    {
      key: 'policy',
      header: 'رقم الوثيقة',
      render: (c: Collection) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-medium">{c.policy?.policy_number}</p>
            <p className="text-xs text-gray-500">قسط #{c.collection_number}</p>
          </div>
        </div>
      ),
    },
    { key: 'client', header: 'العميل', render: (c: Collection) => c.client?.full_name || '-' },
    {
      key: 'amount',
      header: 'المبلغ',
      render: (c: Collection) => `${Number(c.amount).toLocaleString()} ر.س`,
    },
    {
      key: 'due_date',
      header: 'تاريخ الاستحقاق',
      render: (c: Collection) => new Date(c.due_date).toLocaleDateString('ar-SA'),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (c: Collection) => (
        <Badge variant={statusVariants[c.status]}>{COLLECTION_STATUS_LABELS[c.status]}</Badge>
      ),
    },
    {
      key: 'agent',
      header: 'الوكيل',
      render: (c: Collection) => c.agent?.full_name || '-',
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (collection: Collection) => (
        <div className="flex gap-2">
          {collection.status === 'pending' ? (
            <Button size="sm" onClick={() => openPaymentModal(collection)}>
              <CheckCircle className="w-4 h-4" />
              تحصيل
            </Button>
          ) : collection.status === 'paid' ? (
            <Button variant="danger" size="sm" onClick={() => reversePayment(collection)}>
              <RotateCcw className="w-4 h-4" />
              تراجع
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const pendingCount = collections.filter((c) => c.status === 'pending').length;
  const overdueCount = collections.filter((c) => c.status === 'overdue').length;
  const paidCount = collections.filter((c) => c.status === 'paid').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التحصيل</h1>
          <p className="text-gray-500 mt-1">إدارة تحصيل الأقساط</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500 text-white rounded-xl">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-yellow-600 font-medium">معلق</p>
              <p className="text-2xl font-bold text-yellow-900">{pendingCount}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-red-50 border-red-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-500 text-white rounded-xl">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-red-600 font-medium">متأخر</p>
              <p className="text-2xl font-bold text-red-900">{overdueCount}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500 text-white rounded-xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">محصل</p>
              <p className="text-2xl font-bold text-green-900">{paidCount}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="البحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'كل الحالات' },
            { value: 'pending', label: 'معلق' },
            { value: 'paid', label: 'محصل' },
            { value: 'overdue', label: 'متأخر' },
            { value: 'cancelled', label: 'ملغي' },
          ]}
        />
      </div>

      <Card>
        <Table columns={columns} data={collections} loading={loading} />
      </Card>

      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="تسجيل الدفع">
        <form onSubmit={handlePayment} className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg mb-4">
            <p className="text-sm text-gray-500">الوثيقة: {selectedCollection?.policy?.policy_number}</p>
            <p className="text-lg font-bold">{Number(selectedCollection?.amount || 0).toLocaleString()} ر.س</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="تاريخ الدفع" type="date" value={paymentData.payment_date} onChange={(e) => setPaymentData({ ...paymentData, payment_date: e.target.value })} required />
            <Select
              label="طريقة الدفع"
              value={paymentData.payment_method}
              onChange={(e) => setPaymentData({ ...paymentData, payment_method: e.target.value })}
              options={[
                { value: 'cash', label: 'نقداً' },
                { value: 'bank_transfer', label: 'تحويل بنكي' },
                { value: 'check', label: 'شيك' },
                { value: 'card', label: 'بطاقة' },
              ]}
            />
          </div>
          <Input label="رقم الإيصال" value={paymentData.receipt_number} onChange={(e) => setPaymentData({ ...paymentData, receipt_number: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظات</label>
            <textarea
              value={paymentData.notes}
              onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit">تأكيد الدفع</Button>
            <Button variant="secondary" type="button" onClick={() => setShowPaymentModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
