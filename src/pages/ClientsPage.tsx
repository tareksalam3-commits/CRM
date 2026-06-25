import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Button, Modal, Input } from '../components/ui';
import type { Client, Profile, Branch } from '../types/database';
import { Plus, Edit2, Search, User } from 'lucide-react';

export default function ClientsPage() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    national_id: '',
    phone: '',
    mobile: '',
    email: '',
    address: '',
    city: '',
    birth_date: '',
    occupation: '',
    notes: '',
  });

  useEffect(() => {
    fetchClients();
  }, [search]);

  const fetchClients = async () => {
    setLoading(true);
    let query = supabase
      .from('clients')
      .select('*, agent:profiles(full_name), branch:branches(name)')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,mobile.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (!error && data) {
      setClients(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const clientData = {
      full_name: formData.full_name,
      national_id: formData.national_id || null,
      phone: formData.phone || null,
      mobile: formData.mobile || null,
      email: formData.email || null,
      address: formData.address || null,
      city: formData.city || null,
      birth_date: formData.birth_date || null,
      occupation: formData.occupation || null,
      notes: formData.notes || null,
      agent_id: profile!.id,
      branch_id: profile!.branch_id!,
    };

    if (editingClient) {
      const { error } = await supabase
        .from('clients')
        .update(clientData)
        .eq('id', editingClient.id);
      if (!error) {
        setShowModal(false);
        fetchClients();
      }
    } else {
      const { error } = await supabase.from('clients').insert(clientData);
      if (!error) {
        setShowModal(false);
        fetchClients();
      }
    }
  };

  const openNewModal = () => {
    setEditingClient(null);
    setFormData({
      full_name: '',
      national_id: '',
      phone: '',
      mobile: '',
      email: '',
      address: '',
      city: '',
      birth_date: '',
      occupation: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setFormData({
      full_name: client.full_name,
      national_id: client.national_id || '',
      phone: client.phone || '',
      mobile: client.mobile || '',
      email: client.email || '',
      address: client.address || '',
      city: client.city || '',
      birth_date: client.birth_date || '',
      occupation: client.occupation || '',
      notes: client.notes || '',
    });
    setShowModal(true);
  };

  const columns = [
    {
      key: 'full_name',
      header: 'اسم العميل',
      render: (client: Client) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-500" />
          </div>
          <span className="font-medium">{client.full_name}</span>
        </div>
      ),
    },
    { key: 'phone', header: 'الهاتف', render: (c: Client) => c.phone || c.mobile || '-' },
    { key: 'city', header: 'المدينة', render: (c: Client) => c.city || '-' },
    {
      key: 'agent',
      header: 'الوكيل',
      render: (c: Client) => c.agent?.full_name || '-',
    },
    {
      key: 'branch',
      header: 'الفرع',
      render: (c: Client) => c.branch?.name || '-',
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (client: Client) => (
        <Button variant="ghost" size="sm" onClick={() => openEditModal(client)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">العملاء</h1>
          <p className="text-gray-500 mt-1">إدارة بيانات العملاء</p>
        </div>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4" />
          إضافة عميل
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="البحث بالاسم أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Card>
        <Table columns={columns} data={clients} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingClient ? 'تعديل عميل' : 'إضافة عميل'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="الاسم الكامل" value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
            <Input label="رقم الهوية" value={formData.national_id} onChange={(e) => setFormData({ ...formData, national_id: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="الهاتف" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="الجوال" value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="البريد الإلكتروني" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <Input label="المدينة" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="تاريخ الميلاد" type="date" value={formData.birth_date} onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })} />
            <Input label="المهنة" value={formData.occupation} onChange={(e) => setFormData({ ...formData, occupation: e.target.value })} />
          </div>
          <Input label="العنوان" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
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
            <Button type="submit">{editingClient ? 'تحديث' : 'إضافة'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
