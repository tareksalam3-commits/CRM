import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Notification } from '../../types';
import { formatDateTime } from '../../lib/utils';
import PageHeader from '../common/PageHeader';
import LoadingSpinner from '../common/LoadingSpinner';
import { Bell, Check, CheckCheck, Trash2, Wallet, FileText, Target, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Notifications() {
  // BUG FIX #13: Use profile to scope notifications to current user
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadNotifications(); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadNotifications() {
    if (!profile) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      // BUG FIX #13: Filter by current user's ID only
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (data) setNotifications(data);
    setLoading(false);
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (!profile) return;
    // BUG FIX #13: Scope update to current user's notifications only
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('تم قراءة جميع الإشعارات');
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  const typeIcons: Record<string, typeof Bell> = {
    payment: Wallet, policy: FileText, target: Target, user: Users, default: Bell,
  };
  const typeColors: Record<string, string> = {
    payment: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
    policy: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    target: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
    warning: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
    default: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title="الإشعارات" description={`${unreadCount} غير مقروء`} icon={Bell}
        actions={unreadCount > 0 ? (
          <button onClick={markAllRead} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium">
            <CheckCheck className="w-4 h-4" /> قراءة الكل
          </button>
        ) : undefined}
      />

      <div className="space-y-3">
        {notifications.map(notification => {
          const Icon = typeIcons[notification.type] || typeIcons.default;
          const color = typeColors[notification.type] || typeColors.default;
          return (
            <div
              key={notification.id}
              className={`bg-white dark:bg-slate-800 rounded-xl p-4 border transition-colors ${notification.is_read ? 'border-slate-100 dark:border-slate-700' : 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{notification.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{notification.message}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDateTime(notification.created_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!notification.is_read && (
                    <button onClick={() => markAsRead(notification.id)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg" title="قراءة">
                      <Check className="w-4 h-4 text-blue-500" />
                    </button>
                  )}
                  <button onClick={() => deleteNotification(notification.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="حذف">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {notifications.length === 0 && (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">لا توجد إشعارات</p>
          </div>
        )}
      </div>
    </div>
  );
}
