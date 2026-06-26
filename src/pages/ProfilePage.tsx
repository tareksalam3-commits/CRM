import { useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { supabase, getRoleLabel, type UserRole } from '../lib/supabase';
import type { PageProps } from '../types';
import {
  UserCircle, Mail, Shield, Phone, UserCheck, Calendar, KeyRound,
  Pencil, Save, X, Eye, EyeOff, CheckCircle2, AlertCircle,
} from 'lucide-react';

export default function ProfilePage({ showSuccess, showError }: PageProps) {
  const { user } = useAuthContext();
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formData.full_name,
          phone: formData.phone || null,
        })
        .eq('id', user.id);

      if (error) throw error;

      showSuccess('تم تحديث الملف الشخصي بنجاح');
      setIsEditing(false);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showError('كلمتا المرور الجديدتان غير متطابقتين');
      return;
    }
    if (passwordData.newPassword.length < 6) {
      showError('يجب أن تكون كلمة المرور 6 أحرف على الأقل');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (error) throw error;

      showSuccess('تم تغيير كلمة المرور بنجاح');
      setShowPasswordForm(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const InfoRow = ({ icon: Icon, label, value, className = '' }: { icon: React.ElementType; label: string; value: React.ReactNode; className?: string }) => (
    <div className={`flex items-center gap-4 p-4 bg-slate-50 rounded-xl ${className}`}>
      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
        <Icon className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm font-semibold text-slate-900 truncate">{value || '-'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="page-header">
        <h2 className="page-title">الملف الشخصي</h2>
        <p className="page-subtitle">إدارة بياناتك الشخصية وكلمة المرور</p>
      </div>

      {/* Profile Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center shrink-0">
              <UserCircle className="w-8 h-8 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 truncate">{user?.full_name}</h3>
              <p className="text-sm text-slate-500">{getRoleLabel(user?.role as UserRole)}</p>
            </div>
          </div>
          {!isEditing ? (
            <button onClick={() => { setIsEditing(true); setFormData({ full_name: user?.full_name || '', phone: user?.phone || '' }); }} className="btn-secondary text-sm hidden sm:inline-flex">
              <Pencil className="w-4 h-4" />
              تعديل
            </button>
          ) : (
            <div className="flex items-center gap-2 hidden sm:flex">
              <button onClick={() => setIsEditing(false)} className="btn-secondary text-sm">
                <X className="w-4 h-4" />
                إلغاء
              </button>
              <button onClick={handleSaveProfile} disabled={saving} className="btn-primary text-sm">
                <Save className="w-4 h-4" />
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="label">الاسم الكامل</label>
              <input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label">رقم الهاتف</label>
              <input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-field"
                dir="ltr"
              />
            </div>
            <div className="flex gap-3 sm:hidden">
              <button onClick={() => setIsEditing(false)} className="btn-secondary flex-1">
                <X className="w-4 h-4" />
                إلغاء
              </button>
              <button onClick={handleSaveProfile} disabled={saving} className="btn-primary flex-1">
                <Save className="w-4 h-4" />
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <InfoRow icon={UserCircle} label="الاسم الكامل" value={user?.full_name} />
            <InfoRow icon={Mail} label="البريد الإلكتروني" value={user?.email} />
            <InfoRow icon={Shield} label="الدرجة الوظيفية" value={getRoleLabel(user?.role as UserRole)} />
            <InfoRow icon={Phone} label="رقم الهاتف" value={user?.phone} />
            <InfoRow icon={UserCheck} label="حالة الحساب" value={
              <span className={`badge ${user?.is_active ? 'badge-success' : 'badge-secondary'}`}>
                {user?.is_active ? 'نشط' : 'معطل'}
              </span>
            } />
            <InfoRow icon={Calendar} label="تاريخ الإنشاء" value={user?.created_at ? new Date(user.created_at).toLocaleDateString('ar-EG') : '-'} />
          </div>
        )}
      </div>

      {/* Security Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">الأمان</h3>
              <p className="text-sm text-slate-500">تغيير كلمة المرور</p>
            </div>
          </div>
          {!showPasswordForm && (
            <button onClick={() => setShowPasswordForm(true)} className="btn-secondary text-sm hidden sm:inline-flex">
              <KeyRound className="w-4 h-4" />
              تغيير كلمة المرور
            </button>
          )}
        </div>

        {showPasswordForm && (
          <div className="space-y-4">
            <div>
              <label className="label">كلمة المرور الحالية</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="input-field pl-12"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">كلمة المرور الجديدة</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="input-field pl-12"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="input-field"
                dir="ltr"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowPasswordForm(false); setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' }); }} className="btn-secondary flex-1">
                إلغاء
              </button>
              <button onClick={handleChangePassword} disabled={saving} className="btn-primary flex-1">
                {saving ? 'جاري التغيير...' : 'تغيير كلمة المرور'}
              </button>
            </div>
          </div>
        )}

        {/* Mobile change password button */}
        {!showPasswordForm && (
          <button onClick={() => setShowPasswordForm(true)} className="btn-secondary w-full sm:hidden">
            <KeyRound className="w-4 h-4" />
            تغيير كلمة المرور
          </button>
        )}
      </div>
    </div>
  );
}
