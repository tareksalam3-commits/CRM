import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Button, Modal, Input } from '../components/ui';
import type { Branch, Profile } from '../types/database';
import { Plus, Edit2, Building2 } from 'lucide-react';

export default function BranchesPage() {
  const [branches, setBranches] = useState<(Branch & { manager?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    region: '',
    address: '',
    phone: '',
    email: '',
    is_active: true,
  });

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('branches')
      .select('*, manager:profiles!branches_manager_id_fkey(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBranches(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingBranch) {
      const { error } = await supabase
        .from('branches')
        .update({
          name: formData.name,
          code: formData.code,
          region: formData.region || null,
          address: formData.address || null,
          phone: formData.phone || null,
          email: formData.email || null,
          is_active: formData.is_active,
        })
        .eq('id', editingBranch.id);

      if (!error) {
        setShowModal(false);
        fetchBranches();
      }
    } else {
      const { error } = await supabase.from('branches').insert({
        name: formData.name,
        code: formData.code,
        region: formData.region || null,
        address: formData.address || null,
        phone: formData.phone || null,
        email: formData.email || null,
        is_active: formData.is_active,
      });

      if (!error) {
        setShowModal(false);
        fetchBranches();
      }
    }
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code,
      region: branch.region || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      is_active: branch.is_active,
    });
    setShowModal(true);
  };

  const openNewModal = () => {
    setEditingBranch(null);
    setFormData({
      name: '',
      code: '',
      region: '',
      address: '',
      phone: '',
      email: '',
      is_active: true,
    });
    setShowModal(true);
  };

  const columns = [
    {
      key: 'name',
      header: 'اسم الفرع',
      render: (branch: Branch & { manager?: Profile }) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="font-medium">{branch.name}</p>
            <p className="text-xs text-gray-500">{branch.code}</p>
          </div>
        </div>
      ),
    },
    { key: 'region', header: 'المنطقة', render: (b: Branch) => b.region || '-' },
    { key: 'phone', header: 'الهاتف', render: (b: Branch) => b.phone || '-' },
    {
      key: 'manager',
      header: 'المدير',
      render: (b: Branch & { manager?: Profile }) => b.manager?.full_name || '-',
    },
    {
      key: 'is_active',
      header: 'الحالة',
      render: (b: Branch) => (
        <Badge variant={b.is_active ? 'success' : 'danger'}>{b.is_active ? 'نشط' : 'معطل'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (branch: Branch) => (
        <Button variant="ghost" size="sm" onClick={() => openEditModal(branch)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الفروع</h1>
          <p className="text-gray-500 mt-1">إدارة الفروع والمكاتب</p>
        </div>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4" />
          إضافة فرع
        </Button>
      </div>

      <Card>
        <Table columns={columns} data={branches} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="اسم الفرع" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            <Input label="رمز الفرع" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="المنطقة" value={formData.region} onChange={(e) => setFormData({ ...formData, region: e.target.value })} />
            <Input label="الهاتف" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <Input label="البريد الإلكتروني" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          <Input label="العنوان" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="branch_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="branch_active" className="text-sm text-gray-700">فرع نشط</label>
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit">{editingBranch ? 'تحديث' : 'إضافة'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
