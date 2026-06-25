import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, Input, Button, Badge } from '../components/ui';
import type { SystemSettings } from '../types/database';
import { Settings, Save } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('system_settings').select('*').order('key');

    if (!error && data) {
      setSettings(data);
    }
    setLoading(false);
  };

  const updateSetting = async (id: string, value: string) => {
    setSaving(true);
    await supabase.from('system_settings').update({ value }).eq('id', id);
    setSaving(false);
  };

  const settingLabels: Record<string, string> = {
    company_name: 'اسم الشركة',
    currency: 'العملة',
    default_target_dm: 'الهدف الافتراضي لمدير التطوير',
    default_target_gs: 'الهدف الافتراضي للمراقب العام',
    first_year_only: 'تتبع السنة الأولى فقط',
    notifications_enabled: 'تفعيل الإشعارات',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">الإعدادات</h1>
        <p className="text-gray-500 mt-1">إعدادات النظام العامة</p>
      </div>

      <Card>
        <CardHeader title="إعدادات النظام" />

        {loading ? (
          <div className="space-y-4 animate-pulse mt-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {settings.map((setting) => (
              <div key={setting.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Settings className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{settingLabels[setting.key] || setting.key}</p>
                  {setting.description && (
                    <p className="text-xs text-gray-500">{setting.description}</p>
                  )}
                </div>
                <div className="w-64">
                  <Input
                    value={setting.value}
                    onChange={(e) => {
                      const updatedSettings = settings.map((s) =>
                        s.id === setting.id ? { ...s, value: e.target.value } : s
                      );
                      setSettings(updatedSettings);
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => updateSetting(setting.id, setting.value)}
                  loading={saving}
                >
                  <Save className="w-4 h-4" />
                  حفظ
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="معلومات النظام" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">الإصدار</p>
            <p className="text-lg font-bold">1.0.0</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">قاعدة البيانات</p>
            <p className="text-lg font-bold">Supabase</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">الواجهة</p>
            <p className="text-lg font-bold">React + Vite</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">التصميم</p>
            <p className="text-lg font-bold">Tailwind CSS</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
