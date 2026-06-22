import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Branch } from '../../types';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Building2, Plus, Edit2, Trash2, X, Search, CheckCircle, Ban } from 'lucide-react';
import toast from 'react-hot-toast';

const EMPTY_FORM = { name: '', code: '' };
const MAIN_BRANCH_CODE = 'MAIN';

export default function BranchManagement() {
  const { profile } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('branches').select('*').order('name', { ascending: true });
    if (error) toast.error('خطأ في تحميل الفروع');
    else if (data) setBranches(data as Branch[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error('اسم الفرع مطلوب'); return; }
    setSubmitting(true);
    const payload = { name: formData.name.trim(), code: formData.code.trim() || null };
    if (editingBranch) {
      const { error } = await supabase.from('branches').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingBranch.id);
      if (error) toast.error(error.message);
      else toast.success('تم التحديث');
    } else {
      const { error } = await supabase.from('branches').insert(payload);
      if (error) toast.error(error.message);
      else toast.success('تمت الإضافة');
    }
    setSubmitting(false);
    resetForm();
    fetchBranches();
  }

  async function toggleBranchStatus(branch: Branch) {
    if (branch.code === MAIN_BRANCH_CODE) { toast.error('لا يمكن تعطيل الفرع الرئيسي'); return; }
    const { error } = await supabase.from('branches').update({ is_active: !branch.is_active, updated_at: new Date().toISOString() }).eq('id', branch.id);
    if (error) toast.error('خطأ في تحديث الحالة');
    else {
      toast.success(branch.is_active ? 'تم التعطيل' : 'تم التفعيل');
      fetchBranches();
    }
  }

  async function deleteBranch(branch: Branch) {
    if (branch.code === MAIN_BRANCH_CODE) { toast.error('لا يمكن حذف الفرع الرئيسي'); return; }
    if (!confirm(`هل تريد حذف الفرع "${branch.name}"؟`)) return;
    const { error } = await supabase.from('branches').delete().eq('id', branch.id);
    if (error) toast.error('لا يمكن حذف الفرع لارتباطه ببيانات أخرى، يفضل تعطيله');
    else {
      toast.success('تم الحذف');
      fetchBranches();
    }
  }

  function resetForm() { setFormData({ ...EMPTY_FORM }); setEditingBranch(null); setShowForm(false); }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <PageHeader title="إدارة الفروع" icon={Building2} actions={
        <button onClick={() => setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <Plus size={18} /> إضافة فرع
        </button>
      } />

      <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-right border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-700/50">
            <tr>
              <th className="px-6 py-4 text-sm font-semibold">الفرع</th>
              <th className="px-6 py-4 text-sm font-semibold">الكود</th>
              <th className="px-6 py-4 text-sm font-semibold">الحالة</th>
              <th className="px-6 py-4 text-sm font-semibold">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {branches.filter(b => b.name.includes(search)).map(branch => (
              <tr key={branch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                <td className="px-6 py-4 font-medium">{branch.name}</td>
                <td className="px-6 py-4 text-slate-500">{branch.code || '-'}</td>
                <td className="px-6 py-4">
                  <button onClick={() => toggleBranchStatus(branch)} className={`p-1 rounded-lg ${branch.is_active ? 'text-green-600' : 'text-slate-400'}`}>
                    {branch.is_active ? <CheckCircle size={20} /> : <Ban size={20} />}
                  </button>
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button onClick={() => { setEditingBranch(branch); setFormData({ name: branch.name, code: branch.code || '' }); setShowForm(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit2 size={18} /></button>
                  <button onClick={() => deleteBranch(branch)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">{editingBranch ? 'تعديل فرع' : 'إضافة فرع جديد'}</h3>
              <button onClick={resetForm}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input placeholder="اسم الفرع" className="w-full p-2 border rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              <input placeholder="كود الفرع" className="w-full p-2 border rounded-lg" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
              <button type="submit" disabled={submitting} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold">
                {submitting ? 'جاري التنفيذ...' : (editingBranch ? 'تحديث' : 'إضافة')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
