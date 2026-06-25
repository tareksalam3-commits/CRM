import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card, Table, Badge, Button } from '../components/ui';
import type { Notification } from '../types/database';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';

export default function NotificationsPage() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      fetchNotifications();
    }
  }, [profile]);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile!.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setNotifications(data);
    }
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile!.id)
      .eq('is_read', false);
    fetchNotifications();
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    fetchNotifications();
  };

  const typeVariants: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    error: 'danger',
  };

  const typeLabels: Record<string, string> = {
    info: 'معلومات',
    success: 'نجاح',
    warning: 'تنبيه',
    error: 'خطأ',
  };

  const columns = [
    {
      key: 'type',
      header: 'النوع',
      render: (n: Notification) => (
        <Badge variant={typeVariants[n.type]}>{typeLabels[n.type]}</Badge>
      ),
    },
    {
      key: 'title',
      header: 'العنوان',
      render: (n: Notification) => (
        <div className={!n.is_read ? 'font-bold' : ''}>
          {n.title}
        </div>
      ),
    },
    {
      key: 'message',
      header: 'الرسالة',
      render: (n: Notification) => (
        <p className={`text-sm text-gray-600 max-w-md truncate ${!n.is_read ? 'font-medium' : ''}`}>
          {n.message}
        </p>
      ),
    },
    {
      key: 'created_at',
      header: 'التاريخ',
      render: (n: Notification) => new Date(n.created_at).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    },
    {
      key: 'is_read',
      header: 'الحالة',
      render: (n: Notification) => (
        <Badge variant={n.is_read ? 'success' : 'warning'}>
          {n.is_read ? 'مقروءة' : 'جديدة'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'الإجراءات',
      render: (notification: Notification) => (
        <div className="flex gap-2">
          {!notification.is_read && (
            <Button variant="ghost" size="sm" onClick={() => markAsRead(notification.id)}>
              <CheckCheck className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => deleteNotification(notification.id)}>
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ),
    },
  ];

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الإشعارات</h1>
          <p className="text-gray-500 mt-1">
            لديك {unreadCount} إشعار {unreadCount !== 1 ? 'غير مقروء' : 'غير مقروء'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={markAllAsRead}>
            <CheckCheck className="w-4 h-4" />
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      <Card>
        <Table columns={columns} data={notifications} loading={loading} emptyMessage="لا توجد إشعارات" />
      </Card>
    </div>
  );
}
