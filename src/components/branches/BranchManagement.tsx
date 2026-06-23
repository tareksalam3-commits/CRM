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
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) {
      toast.error('خطأ في تحميل الفروع');
    } else if (data) {
      setBranches(data as Branch[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('اسم الفرع مطلوب');
      return;
    }
    setSubmitting(true);
    const payload = { 
      name: formData.name.trim(), 
      code: formData.code.trim().toUpperCase() || null 
    };

    try {
      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingBranch.id);
        
        if (error) throw error;
        toast.success('تم تحديث بيانات الفرع بنجاح');
      } else {
        const { error } = await supabase
          .from('branches')
          .insert(payload);
        
        if (error) throw error;
        toast.success('تمت إضافة الفرع بنجاح');
      }
      resetForm();
      fetchBranches();
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ ما');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleBranchStatus(branch: Branch) {
    if (branch.code === MAIN_BRANCH_CODE) {
      toast.error('لا يمكن تعطيل الفرع الرئيسي');
      return;
    }
    const { error } = await supabase
      .from('branches')
      .update({ is_active: !branch.is_active, updated_at: new Date().toISOString() })
      .eq('id', branch.id);
    
    if (error) {
      toast.error('خطأ في تحديث حالة الفرع');
    } else {
      toast.success(branch.is_active ? 'تم تعطيل الفرع' : 'تم تفعيل الفرع');
      fetchBranches();
    }
  }

  async function deleteBranch(branch: Branch) {
    if (branch.code === MAIN_BRANCH_CODE) {
      toast.error('لا يمكن حذف الفرع الرئيسي');
      return;
    }
    if (!window.confirm(`هل أنت متأكد من حذف الفرع "${branch.name}"؟ لا يمكن التراجع عن هذه الخطوة.`)) return;
    
    const { error } = await supabase
      .from('branches')
      .delete()
      .eq('id', branch.id);
    
    if (error) {
      toast.error('لا يمكن حذف الفرع لارتباطه ببيانات أخرى (مستخدمين أو عملاء). يفضل تعطيله بدلاً من الحذف.');
    } else {
      toast.success('تم حذف الفرع بنجاح');
      fetchBranches();
    }
  }

  function resetForm() {
    setFormData({ ...EMPTY_FORM });
    setEditingBranch(null);
    setShowForm(false);
  }

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase()) || 
    (b.code && b.code.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="إدارة الفروع" 
        icon={Building2} 
        actions={
          <button 
            onClick={() => { resetForm(); setShowForm(true); }} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> إضافة فرع جديد
          </button>
        } 
      />

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="بحث عن فرع..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 dark:bg-slate-900 border-none rounded-lg focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">اسم الفرع</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">الكود</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300">الحالة</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredBranches.map(branch => (
                <tr key={branch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{branch.name}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-sm">{branch.code || '-'}</td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleBranchStatus(branch)} 
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${
                        branch.is_active 
                          ? 'text-green-600 bg-green-50 dark:bg-green-900/20' 
                          : 'text-slate-400 bg-slate-50 dark:bg-slate-900/20'
                      }`}
                    >
                      {branch.is_active ? <CheckCircle size={16} /> : <Ban size={16} />}
                      <span className="text-xs font-medium">{branch.is_active ? 'نشط' : 'معطل'}</span>
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => { 
                          setEditingBranch(branch); 
                          setFormData({ name: branch.name, code: branch.code || '' }); 
                          setShowForm(true); 
                        }} 
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => deleteBranch(branch)} 
                        className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                        title="حذف"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50/50 dark:bg-slate-700/50">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}
              </h3>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">اسم الفرع</label>
                <input 
                  required
                  placeholder="مثال: فرع طنطا" 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">كود الفرع (اختياري)</label>
                <input 
                  placeholder="مثال: TANTA1" 
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all uppercase" 
                  value={formData.code} 
                  onChange={e => setFormData({...formData, code: e.target.value})} 
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={submitting} 
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                >
                  {submitting ? 'جاري الحفظ...' : (editingBranch ? 'تحديث البيانات' : 'إضافة الفرع')}
                </button>
                <button 
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 py-2.5 rounded-lg font-bold transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
