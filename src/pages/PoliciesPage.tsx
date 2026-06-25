import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, Table, Badge, Button, Modal, Input, Select } from '../components/ui';
import type { Policy, Client } from '../types/database';
import { POLICY_STATUS_LABELS } from '../types/database';
import { Plus, Edit2, FileText, Search } from 'lucide-react';

export default function PoliciesPage() {
  const { profile } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [formData, setFormData] = useState({
    policy_number: '',
    client_id: '',
    policy_type: '',
    premium_amount: '',
    monthly_premium: '',
    issue_date: '',
    start_date: '',
    end_date: '',
    beneficiary_name: '',
    beneficiary_relation: '',
    notes: '',
  });

  useEffect(() => {
    fetchPolicies();
    fetchClients();
  }, [search, statusFilter]);

  const fetchPolicies = async () => {
    setLoading(true);
    let query = supabase
      .from('policies')
      .select('*, client:clients(full_name, mobile), agent:profiles(full_name), branch:branches(name)')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`policy_number.ilike.%${search}%,client_id.in.(select id from clients where full_name.ilike.%${search}%)`);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setPolicies(data);
    }
    setLoading(false);
  };

  const fetchClients = async () => {
    const { data } = await supabase.from('clients').select('*').order('full_name');
    if (data) setClients(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const policyData = {
      policy_number: formData.policy_number,
      client_id: formData.client_id,
      agent_id: profile!.id,
      branch_id: profile!.branch_id!,
      policy_type: formData.policy_type,
      premium_amount: Number(formData.premium_amount),
      monthly_premium: Number(formData.monthly_premium),
      issue_date: formData.issue_date,
      start_date: formData.start_date,
      end_date: formData.end_date,
      beneficiary_name: formData.beneficiary_name || null,
      beneficiary_relation: formData.beneficiary_relation || null,
      notes: formData.notes || null,
      status: 'pending',
    };

    if (editingPolicy) {
      const { error } = await supabase
        .from('policies')
        .update(policyData)
        .eq('id', editingPolicy.id);
      if (!error) {
        setShowModal(false);
        fetchPolicies();
      }
    } else {
      const { error } = await supabase.from('policies').insert(policyData);
      if (!error) {
        setShowModal(false);
        fetchPolicies();
      }
    }
  };

  const openNewModal = () => {
    setEditingPolicy(null);
    setFormData({
      policy_number: '',
      client_id: '',
      policy_type: '',
      premium_amount: '',
      monthly_premium: '',
      issue_date: new Date().toISOString().split('T')[0],
      start_date: '',
      end_date: '',
      beneficiary_name: '',
      beneficiary_relation: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (policy: Policy) => {
    setEditingPolicy(policy);
    setFormData({
      policy_number: policy.policy_number,
      client_id: policy.client_id,
      policy_type: policy.policy_type,
      premium_amount: String(policy.premium_amount),
      monthly_premium: String(policy.monthly_premium),
      issue_date: policy.issue_date,
      start_date: policy.start_date,
      end_date: policy.end_date,
      beneficiary_name: policy.beneficiary_name || '',
      beneficiary_relation: policy.beneficiary_relation || '',
      notes: policy.notes || '',
    });
    setShowModal(true);
  };

  const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    active: 'success',
    pending: 'warning',
    cancelled: 'danger',
    expired: 'default',
  };

  const columns = [
    {
      key: 'policy_number',
      header: 'رقم الوثيقة',
      render: (p: Policy) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <span className="font-medium">{p.policy_number}</span>
        </div>
      ),
    },
    { key: 'client', header: 'العميل', render: (p: Policy) => p.client?.full_name || '-' },
    { key: 'policy_type', header: 'نوع الوثيقة' },
    {
      key: 'premium_amount',
      header: 'قيمة القسط',
      render: (p: Policy) => `${Number(p.premium_amount).toLocaleString()} ر.س`,
    },
    {
      key: 'issue_date',
      header: 'تاريخ الإصدار',
      render: (p: Policy) => new Date(p.issue_date).toLocaleDateString('ar-SA'),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (p: Policy) => (
        <Badge variant={statusVariants[p.status]}>{POLICY_STATUS_LABELS[p.status]}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (policy: Policy) => (
        <Button variant="ghost" size="sm" onClick={() => openEditModal(policy)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الوثائق</h1>
          <p className="text-gray-500 mt-1">إدارة وثائق التأمين</p>
        </div>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4" />
          إضافة وثيقة
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="البحث برقم الوثيقة أو العميل..."
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
            { value: 'pending', label: 'قيد الانتظار' },
            { value: 'active', label: 'نشط' },
            { value: 'cancelled', label: 'ملغي' },
            { value: 'expired', label: 'منتهي' },
          ]}
        />
      </div>

      <Card>
        <Table columns={columns} data={policies} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingPolicy ? 'تعديل وثيقة' : 'إضافة وثيقة'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="رقم الوثيقة" value={formData.policy_number} onChange={(e) => setFormData({ ...formData, policy_number: e.target.value })} required />
            <Select
              label="العميل"
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              options={[
                { value: '', label: 'اختر العميل' },
                ...clients.map((c) => ({ value: c.id, label: c.full_name })),
              ]}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="نوع الوثيقة" value={formData.policy_type} onChange={(e) => setFormData({ ...formData, policy_type: e.target.value })} required />
            <Input label="قيمة القسط السنوي" type="number" value={formData.premium_amount} onChange={(e) => setFormData({ ...formData, premium_amount: e.target.value })} required />
            <Input label="القسط الشهري" type="number" value={formData.monthly_premium} onChange={(e) => setFormData({ ...formData, monthly_premium: e.target.value })} required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="تاريخ الإصدار" type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} required />
            <Input label="تاريخ البدء" type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} required />
            <Input label="تاريخ الانتهاء" type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="اسم المستفيد" value={formData.beneficiary_name} onChange={(e) => setFormData({ ...formData, beneficiary_name: e.target.value })} />
            <Input label="صلة القرابة" value={formData.beneficiary_relation} onChange={(e) => setFormData({ ...formData, beneficiary_relation: e.target.value })} />
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
            <Button type="submit">{editingPolicy ? 'تحديث' : 'إضافة'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
