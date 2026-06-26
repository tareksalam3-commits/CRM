import { useEffect, useState } from 'react';
import { supabase, type PolicyType } from '../lib/supabase';
import type { PageProps } from '../types';
import { Save, Building2, DollarSign, Calendar, FileText, Plus, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight } from 'lucide-react';

interface Setting {
  id: string;
  key: string;
  value: string | null;
}

export default function SettingsPage({ showSuccess, showError }: PageProps) {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPolicyTypeForm, setShowPolicyTypeForm] = useState(false);
  const [editingPolicyType, setEditingPolicyType] = useState<PolicyType | null>(null);
  const [policyTypeForm, setPolicyTypeForm] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchSettings();
    fetchPolicyTypes();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('settings').select('*');
    setSettings((data as Setting[]) || []);
    setLoading(false);
  };

  const fetchPolicyTypes = async () => {
    const { data } = await supabase.from('policy_types').select('*').order('name');
    setPolicyTypes((data as PolicyType[]) || []);
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value } : s))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const setting of settings) {
        await supabase.from('settings').update({ value: setting.value }).eq('key', setting.key);
      }
      showSuccess('تم حفظ الإعدادات بنجاح');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePolicyType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPolicyType) {
        const { error } = await supabase.from('policy_types').update({
          name: policyTypeForm.name,
          description: policyTypeForm.description || null,
        }).eq('id', editingPolicyType.id);
        if (error) throw error;
        showSuccess('تم تعديل نوع الوثيقة بنجاح');
      } else {
        const { error } = await supabase.from('policy_types').insert({
          name: policyTypeForm.name,
          description: policyTypeForm.description || null,
        });
        if (error) throw error;
        showSuccess('تم إضافة نوع الوثيقة بنجاح');
      }
      setShowPolicyTypeForm(false);
      setEditingPolicyType(null);
      setPolicyTypeForm({ name: '', description: '' });
      fetchPolicyTypes();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleTogglePolicyType = async (pt: PolicyType) => {
    try {
      const { error } = await supabase.from('policy_types').update({ is_active: !pt.is_active }).eq('id', pt.id);
      if (error) throw error;
      showSuccess(pt.is_active ? 'تم إيقاف نوع الوثيقة' : 'تم تفعيل نوع الوثيقة');
      fetchPolicyTypes();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleDeletePolicyType = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا النوع؟ قد تكون هناك وثائق مرتبطة به.')) return;
    try {
      const { error } = await supabase.from('policy_types').delete().eq('id', id);
      if (error) throw error;
      showSuccess('تم حذف نوع الوثيقة بنجاح');
      fetchPolicyTypes();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  };

  const handleEditPolicyType = (pt: PolicyType) => {
    setEditingPolicyType(pt);
    setPolicyTypeForm({ name: pt.name, description: pt.description || '' });
    setShowPolicyTypeForm(true);
  };

  const getSettingValue = (key: string) => settings.find((s) => s.key === key)?.value || '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="page-header flex items-center justify-between">
        <div>
          <h2 className="page-title">الإعدادات</h2>
          <p className="page-subtitle">إعدادات النظام العامة</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary hidden sm:inline-flex">
          <Save className="w-5 h-5" />
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>

      {/* Company Settings */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">إعدادات الشركة</h3>
            <p className="text-sm text-slate-500">معلومات الشركة الأساسية</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">اسم الشركة</label>
            <input
              value={getSettingValue('company_name')}
              onChange={(e) => updateSetting('company_name', e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">العملة</label>
            <div className="relative">
              <DollarSign className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                value={getSettingValue('currency')}
                onChange={(e) => updateSetting('currency', e.target.value)}
                className="input-field pr-11"
              />
            </div>
          </div>
          <div>
            <label className="label">بداية السنة المالية (الشهر)</label>
            <div className="relative">
              <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
              <input
                type="number"
                min={1}
                max={12}
                value={getSettingValue('fiscal_year_start')}
                onChange={(e) => updateSetting('fiscal_year_start', e.target.value)}
                className="input-field pr-11"
              />
            </div>
          </div>
          <div>
            <label className="label">طريقة السداد الافتراضية</label>
            <select
              value={getSettingValue('default_payment_method')}
              onChange={(e) => updateSetting('default_payment_method', e.target.value)}
              className="input-field"
            >
              <option value="annual">سنوي</option>
              <option value="semi_annual">نصف سنوي</option>
              <option value="quarterly">ربع سنوي</option>
              <option value="monthly">شهري</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button (Mobile) */}
      <div className="sm:hidden">
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          <Save className="w-5 h-5" />
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>

      {/* Policy Types Management */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">أنواع الوثائق</h3>
              <p className="text-sm text-slate-500">إدارة أنواع الوثائق المتاحة</p>
            </div>
          </div>
          <button
            onClick={() => { setShowPolicyTypeForm(true); setEditingPolicyType(null); setPolicyTypeForm({ name: '', description: '' }); }}
            className="btn-primary text-sm hidden sm:inline-flex"
          >
            <Plus className="w-4 h-4" />
            نوع جديد
          </button>
        </div>

        {/* Mobile Policy Type Cards */}
        <div className="sm:hidden space-y-3">
          {policyTypes.map((pt) => (
            <div key={pt.id} className="card-hover">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-slate-900">{pt.name}</p>
                <span className={`badge ${pt.is_active ? 'badge-success' : 'badge-secondary'}`}>
                  {pt.is_active ? 'نشط' : 'معطل'}
                </span>
              </div>
              <p className="text-sm text-slate-500 mb-3">{pt.description || 'لا يوجد وصف'}</p>
              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => handleTogglePolicyType(pt)}
                  className="action-btn-view flex-1"
                  title={pt.is_active ? 'إيقاف' : 'تفعيل'}
                >
                  {pt.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {pt.is_active ? 'إيقاف' : 'تفعيل'}
                </button>
                <button onClick={() => handleEditPolicyType(pt)} className="action-btn-edit flex-1">
                  <Pencil className="w-4 h-4" />
                  تعديل
                </button>
                <button onClick={() => handleDeletePolicyType(pt.id)} className="action-btn-delete flex-1">
                  <Trash2 className="w-4 h-4" />
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Policy Types Table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">الاسم</th>
                <th className="table-header">الوصف</th>
                <th className="table-header">الحالة</th>
                <th className="table-header">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {policyTypes.map((pt) => (
                <tr key={pt.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-medium">{pt.name}</td>
                  <td className="table-cell">{pt.description || '-'}</td>
                  <td className="table-cell">
                    <span className={`badge ${pt.is_active ? 'badge-success' : 'badge-secondary'}`}>
                      {pt.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTogglePolicyType(pt)}
                        className="action-btn-view"
                        title={pt.is_active ? 'إيقاف' : 'تفعيل'}
                      >
                        {pt.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleEditPolicyType(pt)} className="action-btn-edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeletePolicyType(pt.id)} className="action-btn-delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => { setShowPolicyTypeForm(true); setEditingPolicyType(null); setPolicyTypeForm({ name: '', description: '' }); }}
        className="fab"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Bottom Sheet Form (Mobile) / Inline Form (Desktop) */}
      {showPolicyTypeForm && (
        <>
          <div className="bottom-sheet-overlay sm:hidden" onClick={() => setShowPolicyTypeForm(false)} />
          <div className="bottom-sheet sm:static sm:inset-auto sm:bottom-auto sm:bg-transparent sm:shadow-none sm:rounded-none sm:z-auto sm:max-h-none sm:overflow-visible">
            <div className="p-5 sm:p-0 space-y-4">
              <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-4 sm:hidden" />
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">{editingPolicyType ? 'تعديل نوع وثيقة' : 'نوع وثيقة جديد'}</h4>
                <button onClick={() => setShowPolicyTypeForm(false)} className="btn-icon sm:hidden">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSavePolicyType} className="space-y-4">
                <div>
                  <label className="label">الاسم *</label>
                  <input
                    value={policyTypeForm.name}
                    onChange={(e) => setPolicyTypeForm({ ...policyTypeForm, name: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="label">الوصف</label>
                  <input
                    value={policyTypeForm.description}
                    onChange={(e) => setPolicyTypeForm({ ...policyTypeForm, description: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowPolicyTypeForm(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button type="submit" className="btn-primary flex-1">
                    <Check className="w-4 h-4" />
                    {editingPolicyType ? 'حفظ التعديل' : 'إضافة'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
