import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Settings as SettingsIcon, Save, Building2, Package, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SystemSettings() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    company_name: 'Insurance CRM Pro',
    insurance_products: [] as string[],
    insurance_companies: [] as string[],
  });
  const [newProduct, setNewProduct] = useState('');
  const [newCompany, setNewCompany] = useState('');

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase.from('system_settings').select('key, value');
      if (error) {
        console.error('Error loading settings:', error);
        toast.error('خطأ في تحميل الإعدادات');
        setLoading(false);
        return;
      }
      if (data) {
        const mapped: Record<string, unknown> = {};
        data.forEach(s => { mapped[s.key] = s.value; });
        setSettings({
          company_name: (mapped.company_name as string) || 'Insurance CRM Pro',
          insurance_products: (Array.isArray(mapped.insurance_products) ? mapped.insurance_products : []) as string[],
          insurance_companies: (Array.isArray(mapped.insurance_companies) ? mapped.insurance_companies : []) as string[],
        });
      }
    } catch (err) {
      console.error('Unexpected error loading settings:', err);
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  async function saveSetting(key: string, value: unknown) {
    if (!profile) {
      toast.error('يجب تسجيل الدخول أولاً');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('system_settings').upsert({
        key,
        value: JSON.parse(JSON.stringify(value)),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) {
        console.error('Error saving setting:', error);
        if (error.code === '42501') {
          toast.error('غير مصرح بتعديل الإعدادات');
        } else {
          toast.error('خطأ في الحفظ: ' + error.message);
        }
      } else {
        toast.success('✅ تم الحفظ بنجاح');
      }
    } catch (err) {
      console.error('Unexpected error saving setting:', err);
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSaving(false);
    }
  }

  function addProduct() {
    const trimmed = newProduct.trim();
    if (!trimmed) {
      toast.error('أدخل اسم المنتج');
      return;
    }
    if (settings.insurance_products.includes(trimmed)) {
      toast.error('هذا المنتج موجود بالفعل');
      return;
    }
    const updated = [...settings.insurance_products, trimmed];
    setSettings({ ...settings, insurance_products: updated });
    saveSetting('insurance_products', updated);
    setNewProduct('');
  }

  function removeProduct(idx: number) {
    const updated = settings.insurance_products.filter((_, i) => i !== idx);
    setSettings({ ...settings, insurance_products: updated });
    saveSetting('insurance_products', updated);
  }

  function addCompany() {
    const trimmed = newCompany.trim();
    if (!trimmed) {
      toast.error('أدخل اسم الشركة');
      return;
    }
    if (settings.insurance_companies.includes(trimmed)) {
      toast.error('هذه الشركة موجودة بالفعل');
      return;
    }
    const updated = [...settings.insurance_companies, trimmed];
    setSettings({ ...settings, insurance_companies: updated });
    saveSetting('insurance_companies', updated);
    setNewCompany('');
  }

  function removeCompany(idx: number) {
    const updated = settings.insurance_companies.filter((_, i) => i !== idx);
    setSettings({ ...settings, insurance_companies: updated });
    saveSetting('insurance_companies', updated);
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="إعدادات النظام" description="إدارة إعدادات التطبيق" icon={SettingsIcon} />

      <div className="space-y-6">
        {/* Company Name */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">بيانات الشركة</h3>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={settings.company_name}
              onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={() => saveSetting('company_name', settings.company_name)} disabled={saving}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium flex items-center gap-2">
              <Save className="w-4 h-4" /> حفظ
            </button>
          </div>
        </div>

        {/* Insurance Products */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">المنتجات التأمينية</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <input type="text" value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="اسم المنتج"
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && addProduct()} />
            <button onClick={addProduct} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium">إضافة</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.insurance_products.map((p, i) => (
              <span key={i} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300">
                {p}
                <button onClick={() => removeProduct(i)} className="text-red-400 hover:text-red-600 mr-1">&times;</button>
              </span>
            ))}
          </div>
        </div>

        {/* Insurance Companies */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">شركات التأمين</h3>
          </div>
          <div className="flex gap-2 mb-3">
            <input type="text" value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="اسم الشركة"
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => e.key === 'Enter' && addCompany()} />
            <button onClick={addCompany} className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium">إضافة</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {settings.insurance_companies.map((c, i) => (
              <span key={i} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300">
                {c}
                <button onClick={() => removeCompany(i)} className="text-red-400 hover:text-red-600 mr-1">&times;</button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
