import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Button, Modal, Select, Input } from '../components/ui';
import type { MonthClosing, Branch } from '../types/database';
import { CalendarCheck, Lock, Unlock, AlertTriangle } from 'lucide-react';

export default function MonthClosingPage() {
  const [closings, setClosings] = useState<MonthClosing[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    branch_id: '',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    notes: '',
  });

  useEffect(() => {
    fetchClosings();
    fetchBranches();
  }, []);

  const fetchClosings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('month_closing')
      .select('*, branch:branches(name), closer:profiles(full_name)')
      .order('closed_at', { ascending: false });

    if (!error && data) {
      setClosings(data);
    }
    setLoading(false);
  };

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('*').eq('is_active', true);
    if (data) setBranches(data);
  };

  const handleCloseMonth = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('month_closing').insert({
      branch_id: formData.branch_id || null,
      year: formData.year,
      month: formData.month,
      notes: formData.notes || null,
    });

    if (!error) {
      setShowModal(false);
      fetchClosings();
    }
  };

  const toggleLock = async (closing: MonthClosing) => {
    await supabase
      .from('month_closing')
      .update({ is_locked: !closing.is_locked })
      .eq('id', closing.id);
    fetchClosings();
  };

  const months = [
    { value: 1, label: 'يناير' },
    { value: 2, label: 'فبراير' },
    { value: 3, label: 'مارس' },
    { value: 4, label: 'أبريل' },
    { value: 5, label: 'مايو' },
    { value: 6, label: 'يونيو' },
    { value: 7, label: 'يوليو' },
    { value: 8, label: 'أغسطس' },
    { value: 9, label: 'سبتمبر' },
    { value: 10, label: 'أكتوبر' },
    { value: 11, label: 'نوفمبر' },
    { value: 12, label: 'ديسمبر' },
  ];

  const columns = [
    {
      key: 'period',
      header: 'الفترة',
      render: (c: MonthClosing) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <CalendarCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-medium">{months.find((m) => m.value === c.month)?.label} {c.year}</p>
            <p className="text-xs text-gray-500">{c.branch?.name || 'كل الفروع'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'closed_at',
      header: 'تاريخ الإغلاق',
      render: (c: MonthClosing) => new Date(c.closed_at).toLocaleDateString('ar-SA'),
    },
    {
      key: 'closer',
      header: 'أغلق بواسطة',
      render: (c: MonthClosing) => c.closer?.full_name || '-',
    },
    {
      key: 'is_locked',
      header: 'الحالة',
      render: (c: MonthClosing) => (
        <Badge variant={c.is_locked ? 'danger' : 'success'}>
          {c.is_locked ? 'مقفل نهائياً' : 'مفتوح'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (closing: MonthClosing) => (
        <Button
          variant={closing.is_locked ? 'secondary' : 'danger'}
          size="sm"
          onClick={() => toggleLock(closing)}
        >
          {closing.is_locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          {closing.is_locked ? 'فك القفل' : 'قفل نهائي'}
        </Button>
      ),
    },
  ];

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const alreadyClosed = closings.some((c) => c.month === currentMonth && c.year === currentYear);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إغلاق الشهر</h1>
          <p className="text-gray-500 mt-1">إدارة إغلاق الفترات الشهرية</p>
        </div>
        {!alreadyClosed && (
          <Button onClick={() => setShowModal(true)}>
            <CalendarCheck className="w-4 h-4" />
            إغلاق الشهر الحالي
          </Button>
        )}
      </div>

      {alreadyClosed && (
        <Card className="bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">تم إغلاق الشهر الحالي</p>
              <p className="text-sm text-yellow-600">لا يمكن إضافة أو تعديل بيانات الشهر الحالي</p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <Table columns={columns} data={closings} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="إغلاق الشهر">
        <form onSubmit={handleCloseMonth} className="space-y-4">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm mb-4">
            تحذير: إغلاق الشهر سيمنع أي تعديلات على البيانات للفترة المحددة
          </div>
          <Select
            label="الفرع"
            value={formData.branch_id}
            onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
            options={[
              { value: '', label: 'كل الفروع' },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="الشهر"
              value={String(formData.month)}
              onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })}
              options={months.map((m) => ({ value: String(m.value), label: m.label }))}
            />
            <Input
              label="السنة"
              type="number"
              value={String(formData.year)}
              onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">ملاحظات</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit">تأكيد الإغلاق</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
