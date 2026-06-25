import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Button, Modal, Input } from '../components/ui';
import type { Target, Profile } from '../types/database';
import { Target as TargetIcon, Edit2, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';

export default function TargetsPage() {
  const { profile, hasRole } = useAuth();
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target | null>(null);
  const [formData, setFormData] = useState({
    target_amount: '',
    target_policies: '',
    target_collections: '',
  });

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    setLoading(true);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const { data, error } = await supabase
      .from('targets')
      .select('*, user:profiles(full_name, role), branch:branches(name)')
      .eq('year', currentYear)
      .eq('month', currentMonth)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTargets(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;

    const { error } = await supabase
      .from('targets')
      .update({
        target_amount: Number(formData.target_amount),
        target_policies: Number(formData.target_policies),
        target_collections: Number(formData.target_collections),
      })
      .eq('id', editingTarget.id);

    if (!error) {
      setShowModal(false);
      fetchTargets();
    }
  };

  const openEditModal = (target: Target) => {
    setEditingTarget(target);
    setFormData({
      target_amount: String(target.target_amount),
      target_policies: String(target.target_policies),
      target_collections: String(target.target_collections),
    });
    setShowModal(true);
  };

  const columns = [
    {
      key: 'user',
      header: 'المستخدم',
      render: (t: Target) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
            {t.user?.full_name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="font-medium">{t.user?.full_name || '-'}</p>
            <p className="text-xs text-gray-500">{t.branch?.name || 'بدون فرع'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'target_amount',
      header: 'الهدف الشهري',
      render: (t: Target) => `${Number(t.target_amount).toLocaleString()} ر.س`,
    },
    {
      key: 'achieved_amount',
      header: 'المحقق',
      render: (t: Target) => {
        const percentage = t.target_amount > 0 ? (Number(t.achieved_amount) / Number(t.target_amount)) * 100 : 0;
        return (
          <div>
            <p className="font-medium">{Number(t.achieved_amount).toLocaleString()} ر.س</p>
            <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
              <div
                className={`h-full rounded-full ${percentage >= 100 ? 'bg-green-500' : percentage >= 50 ? 'bg-blue-500' : 'bg-yellow-500'}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'achievement',
      header: 'نسبة الإنجاز',
      render: (t: Target) => {
        const percentage = t.target_amount > 0 ? (Number(t.achieved_amount) / Number(t.target_amount)) * 100 : 0;
        return (
          <Badge variant={percentage >= 100 ? 'success' : percentage >= 50 ? 'info' : 'warning'}>
            {percentage.toFixed(1)}%
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (target: Target) => (
        <Button variant="ghost" size="sm" onClick={() => openEditModal(target)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  const currentMonthTargets = targets.filter((t) => t.month === new Date().getMonth() + 1);
  const totalTarget = currentMonthTargets.reduce((sum, t) => sum + Number(t.target_amount), 0);
  const totalAchieved = currentMonthTargets.reduce((sum, t) => sum + Number(t.achieved_amount), 0);
  const overallPercentage = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الأهداف</h1>
          <p className="text-gray-500 mt-1">الأهداف الشهرية للمستخدمين</p>
        </div>
      </div>

      {/* Overall Progress */}
      <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-100">إجمالي الأهداف الشهرية</p>
            <p className="text-3xl font-bold mt-1">{totalTarget.toLocaleString()} ر.س</p>
            <div className="flex items-center gap-2 mt-2">
              {overallPercentage >= 100 ? (
                <TrendingUp className="w-5 h-5" />
              ) : (
                <TrendingDown className="w-5 h-5" />
              )}
              <span className="text-sm">
                {overallPercentage.toFixed(1)}% محقق ({totalAchieved.toLocaleString()} ر.س)
              </span>
            </div>
          </div>
          <TargetIcon className="w-16 h-16 text-blue-300" />
        </div>
      </Card>

      <Card>
        <CardHeader title={`أهداف ${new Date().toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' })}`} />
        <Table columns={columns} data={currentMonthTargets} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="تعديل الهدف">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="الهدف الشهري (ريال)" type="number" value={formData.target_amount} onChange={(e) => setFormData({ ...formData, target_amount: e.target.value })} required />
          <Input label="هدف عدد الوثائق" type="number" value={formData.target_policies} onChange={(e) => setFormData({ ...formData, target_policies: e.target.value })} />
          <Input label="هدف عدد التحصيلات" type="number" value={formData.target_collections} onChange={(e) => setFormData({ ...formData, target_collections: e.target.value })} />
          <div className="flex gap-3 pt-4">
            <Button type="submit">حفظ</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
