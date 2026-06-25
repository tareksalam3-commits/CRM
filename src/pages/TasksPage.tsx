import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Table, Badge, Button, Modal, Input, Select } from '../components/ui';
import type { Task, Profile } from '../types/database';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '../types/database';
import { Plus, Edit2, ClipboardList, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function TasksPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: '',
    due_date: '',
    priority: 'medium' as Task['priority'],
  });

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [statusFilter]);

  const fetchTasks = async () => {
    setLoading(true);
    let query = supabase
      .from('tasks')
      .select('*, assignee:profiles!tasks_assigned_to_fkey(full_name), assigner:profiles!tasks_assigned_by_fkey(full_name)')
      .order('due_date', { ascending: true });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setTasks(data);
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_active', true);
    if (data) setUsers(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const taskData = {
      title: formData.title,
      description: formData.description || null,
      assigned_to: formData.assigned_to,
      assigned_by: profile!.id,
      due_date: formData.due_date || null,
      priority: formData.priority,
      status: 'pending',
    };

    if (editingTask) {
      const { error } = await supabase
        .from('tasks')
        .update(taskData)
        .eq('id', editingTask.id);
      if (!error) {
        setShowModal(false);
        fetchTasks();
      }
    } else {
      const { error } = await supabase.from('tasks').insert(taskData);
      if (!error) {
        setShowModal(false);
        fetchTasks();
      }
    }
  };

  const updateTaskStatus = async (task: Task, status: Task['status']) => {
    await supabase
      .from('tasks')
      .update({
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      })
      .eq('id', task.id);
    fetchTasks();
  };

  const openNewModal = () => {
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      assigned_to: '',
      due_date: '',
      priority: 'medium',
    });
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to,
      due_date: task.due_date || '',
      priority: task.priority,
    });
    setShowModal(true);
  };

  const statusVariants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    pending: 'warning',
    in_progress: 'info',
    completed: 'success',
    cancelled: 'danger',
  };

  const priorityVariants: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    low: 'default',
    medium: 'warning',
    high: 'danger',
    urgent: 'danger',
  };

  const columns = [
    {
      key: 'title',
      header: 'المهمة',
      render: (t: Task) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-gray-600" />
          </div>
          <div>
            <p className="font-medium">{t.title}</p>
            {t.description && (
              <p className="text-xs text-gray-500 truncate max-w-xs">{t.description}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'assignee',
      header: 'المسند إليه',
      render: (t: Task) => t.assignee?.full_name || '-',
    },
    {
      key: 'due_date',
      header: 'الموعد النهائي',
      render: (t: Task) => t.due_date ? new Date(t.due_date).toLocaleDateString('ar-SA') : '-',
    },
    {
      key: 'priority',
      header: 'الأولوية',
      render: (t: Task) => (
        <Badge variant={priorityVariants[t.priority]}>{TASK_PRIORITY_LABELS[t.priority]}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'الحالة',
      render: (t: Task) => (
        <Badge variant={statusVariants[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (task: Task) => (
        <div className="flex gap-2">
          {task.status === 'pending' && (
            <Button variant="ghost" size="sm" onClick={() => updateTaskStatus(task, 'in_progress')}>
              <Clock className="w-4 h-4" />
            </Button>
          )}
          {task.status !== 'completed' && (
            <Button variant="ghost" size="sm" onClick={() => updateTaskStatus(task, 'completed')}>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => openEditModal(task)}>
            <Edit2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ];

  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المهام</h1>
          <p className="text-gray-500 mt-1">إدارة المهام والأنشطة</p>
        </div>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4" />
          إضافة مهمة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-500 text-white rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-yellow-600 font-medium">قيد الانتظار</p>
              <p className="text-2xl font-bold text-yellow-900">{pendingTasks}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500 text-white rounded-xl">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-blue-600 font-medium">جارية</p>
              <p className="text-2xl font-bold text-blue-900">{inProgressTasks}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500 text-white rounded-xl">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-green-600 font-medium">مكتملة</p>
              <p className="text-2xl font-bold text-green-900">{completedTasks}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="max-w-xs">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: '', label: 'كل الحالات' },
            { value: 'pending', label: 'قيد الانتظار' },
            { value: 'in_progress', label: 'جارية' },
            { value: 'completed', label: 'مكتملة' },
            { value: 'cancelled', label: 'ملغاة' },
          ]}
        />
      </div>

      <Card>
        <Table columns={columns} data={tasks} loading={loading} />
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingTask ? 'تعديل مهمة' : 'إضافة مهمة'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="عنوان المهمة" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الوصف</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="المسند إليه"
              value={formData.assigned_to}
              onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              options={[
                { value: '', label: 'اختر المستخدم' },
                ...users.map((u) => ({ value: u.id, label: u.full_name })),
              ]}
              required
            />
            <Select
              label="الأولوية"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as Task['priority'] })}
              options={Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <Input label="الموعد النهائي" type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
          <div className="flex gap-3 pt-4">
            <Button type="submit">{editingTask ? 'تحديث' : 'إضافة'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>إلغاء</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
