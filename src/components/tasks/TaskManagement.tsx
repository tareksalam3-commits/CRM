import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Task, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, TaskStatus, TaskPriority } from '../../types';
import { formatDate } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { CheckSquare, Plus, X, Edit2, Clock, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TaskManagement() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');

  const [formData, setFormData] = useState({
    title: '', description: '', assigned_to: '', due_date: '', priority: 'medium' as TaskPriority, status: 'new' as TaskStatus,
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [tasksRes, usersRes] = await Promise.all([
      supabase.from('tasks').select('*, assignee:profiles!tasks_assigned_to_fkey(full_name), creator:profiles!tasks_created_by_fkey(full_name)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('is_active', true),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data as unknown as Task[]);
    if (usersRes.data) setUsers(usersRes.data);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const payload = {
      title: formData.title,
      description: formData.description || null,
      assigned_to: formData.assigned_to || profile.id,
      due_date: formData.due_date,
      priority: formData.priority,
      status: formData.status,
      created_by: profile.id,
    };

    if (editingTask) {
      const { error } = await supabase.from('tasks').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingTask.id);
      if (error) { toast.error('خطأ في تحديث المهمة'); return; }
      toast.success('تم تحديث المهمة');
    } else {
      const { error } = await supabase.from('tasks').insert(payload);
      if (error) { toast.error('خطأ في إنشاء المهمة'); return; }
      toast.success('تم إنشاء المهمة');
    }
    resetForm();
    loadData();
  }

  async function updateStatus(task: Task, status: TaskStatus) {
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', task.id);
    loadData();
  }

  function startEdit(task: Task) {
    setEditingTask(task);
    setFormData({
      title: task.title, description: task.description || '', assigned_to: task.assigned_to,
      due_date: task.due_date, priority: task.priority, status: task.status,
    });
    setShowForm(true);
  }

  function resetForm() {
    setShowForm(false);
    setEditingTask(null);
    setFormData({ title: '', description: '', assigned_to: '', due_date: '', priority: 'medium', status: 'new' });
  }

  const statusIcons: Record<TaskStatus, typeof Circle> = { new: Circle, in_progress: Clock, completed: CheckCircle2, overdue: AlertTriangle };
  const statusColors: Record<TaskStatus, string> = {
    new: 'text-blue-500', in_progress: 'text-amber-500', completed: 'text-emerald-500', overdue: 'text-red-500',
  };
  const priorityColors: Record<TaskPriority, string> = {
    low: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    medium: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    high: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    urgent: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  };

  const filtered = tasks.filter(t => filter === 'all' || t.status === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="المهام والمتابعات" description={`${tasks.length} مهمة`} icon={CheckSquare}
        actions={<button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium"><Plus className="w-4 h-4" /><span className="hidden sm:inline">مهمة جديدة</span></button>}
      />

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {[{ key: 'all', label: 'الكل' }, ...Object.entries(TASK_STATUS_LABELS).map(([k, v]) => ({ key: k, label: v }))].map(tab => (
          <button key={tab.key} onClick={() => setFilter(tab.key as 'all' | TaskStatus)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${filter === tab.key ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'}`}
          >{tab.label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(task => {
          const Icon = statusIcons[task.status];
          return (
            <div key={task.id} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <button onClick={() => updateStatus(task, task.status === 'completed' ? 'new' : 'completed')} className="mt-0.5">
                  <Icon className={`w-5 h-5 ${statusColors[task.status]}`} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-medium ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{task.title}</p>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${priorityColors[task.priority]}`}>{TASK_PRIORITY_LABELS[task.priority]}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span>{(task as unknown as Task & { assignee?: { full_name: string } }).assignee?.full_name}</span>
                    <span>|</span>
                    <span>استحقاق: {formatDate(task.due_date)}</span>
                  </div>
                </div>
                <button onClick={() => startEdit(task)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                  <Edit2 className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-12 text-slate-400">لا توجد مهام</div>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingTask ? 'تعديل مهمة' : 'مهمة جديدة'}</h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">العنوان</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوصف</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">مسند إلى</label>
                <select value={formData.assigned_to} onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                  <option value="">أنا</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ الاستحقاق</label>
                  <input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} required className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الأولوية</label>
                  <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              {editingTask && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة</label>
                  <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as TaskStatus })} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500">
                    {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3">
                <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">{editingTask ? 'تحديث' : 'إنشاء'}</button>
                <button type="button" onClick={resetForm} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
