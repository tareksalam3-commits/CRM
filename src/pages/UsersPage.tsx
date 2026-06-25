import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Button, Modal, Input, Select } from '../components/ui';
import type { Profile, UserRole, Branch } from '../types/database';
import { ROLE_LABELS } from '../types/database';
import { Plus, Edit2, UserCheck, UserX } from 'lucide-react';

export default function UsersPage() {
  const { profile, hasRole } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'agent' as UserRole,
    branch_id: '',
    phone: '',
    is_active: true,
  });

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*, branch:branches(*)')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  };

  const fetchBranches = async () => {
    const { data } = await supabase.from('branches').select('*').eq('is_active', true);
    if (data) setBranches(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          role: formData.role,
          branch_id: formData.branch_id || null,
          phone: formData.phone || null,
          is_active: formData.is_active,
        })
        .eq('id', editingUser.id);

      if (!error) {
        setShowModal(false);
        fetchUsers();
      }
    }
  };

  const toggleUserStatus = async (user: Profile) => {
    await supabase
      .from('profiles')
      .update({ is_active: !user.is_active })
      .eq('id', user.id);
    fetchUsers();
  };

  const openEditModal = (user: Profile) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      branch_id: user.branch_id || '',
      phone: user.phone || '',
      is_active: user.is_active,
    });
    setShowModal(true);
  };

  const columns = [
    { key: 'full_name', header: 'الاسم' },
    { key: 'email', header: 'البريد الإلكتروني' },
    {
      key: 'role',
      header: 'الدور',
      render: (user: Profile) => (
        <Badge variant={user.role === 'super_admin' ? 'danger' : user.role === 'development_manager' ? 'warning' : 'info'}>
          {ROLE_LABELS[user.role]}
        </Badge>
      ),
    },
    {
      key: 'branch',
      header: 'الفرع',
      render: (user: Profile) => user.branch?.name || '-',
    },
    {
      key: 'is_active',
      header: 'الحالة',
      render: (user: Profile) => (
        <Badge variant={user.is_active ? 'success' : 'danger'}>
          {user.is_active ? 'نشط' : 'معطل'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (user: Profile) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openEditModal(user)}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant={user.is_active ? 'danger' : 'success'}
            size="sm"
            onClick={() => toggleUserStatus(user)}
          >
            {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المستخدمين</h1>
          <p className="text-gray-500 mt-1">إدارة حسابات المستخدمين والصلاحيات</p>
        </div>
      </div>

      <Card>
        <Table columns={columns} data={users} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="تعديل المستخدم">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="الاسم الكامل" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
          <Input label="البريد الإلكتروني" value={formData.email} disabled />
          <Input label="الهاتف" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          <Select
            label="الدور"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
            options={Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="الفرع"
            value={formData.branch_id}
            onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
            options={[{ value: '', label: 'بدون فرع' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded"
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">مستخدم نشط</label>
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit">حفظ</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
