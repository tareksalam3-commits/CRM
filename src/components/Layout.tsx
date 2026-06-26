import { useState, useEffect } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, FileText, Receipt, Target, BarChart3,
  Settings, LogOut, Menu, X, Shield, CalendarCheck, BookOpen,
  ChevronLeft, UserCircle, User, Bell, Search,
} from 'lucide-react';
import { getRoleLabel, type UserRole } from '../lib/supabase';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'users', label: 'المستخدمين', icon: Users, roles: ['super_admin', 'dev_manager', 'general_supervisor'] },
  { id: 'clients', label: 'العملاء', icon: UserCircle, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'policies', label: 'الوثائق', icon: FileText, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'collections', label: 'التحصيل', icon: Receipt, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'targets', label: 'التارجتات', icon: Target, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'reports', label: 'التقارير', icon: BarChart3, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'monthly-closing', label: 'تقفيل الشهر', icon: CalendarCheck, roles: ['super_admin', 'dev_manager', 'general_supervisor'] },
  { id: 'activity-logs', label: 'سجل العمليات', icon: BookOpen, roles: ['super_admin', 'dev_manager', 'general_supervisor'] },
  { id: 'settings', label: 'الإعدادات', icon: Settings, roles: ['super_admin', 'dev_manager'] },
  { id: 'profile', label: 'الملف الشخصي', icon: User, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
];

const pageTitles: Record<string, string> = {
  dashboard: 'الرئيسية',
  users: 'المستخدمين',
  clients: 'العملاء',
  policies: 'الوثائق',
  collections: 'التحصيل',
  targets: 'التارجتات',
  reports: 'التقارير',
  'monthly-closing': 'تقفيل الشهر',
  'activity-logs': 'سجل العمليات',
  settings: 'الإعدادات',
  profile: 'الملف الشخصي',
};

export default function Layout({ children, currentPage, onNavigate }: LayoutProps) {
  const { user, signOut } = useAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const allowedItems = menuItems.filter((item) =>
    item.roles.includes((user?.role as UserRole) || 'agent')
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 right-0 h-screen w-72 bg-white border-l border-slate-100 z-50 flex flex-col transition-transform duration-300 ease-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-sm shadow-emerald-200">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-base leading-tight">تأمينات الحياة</h1>
              <p className="text-[11px] text-slate-400 font-medium">نظام إدارة متكامل</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="absolute top-4 left-4 lg:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${active ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {active && <ChevronLeft className="w-4 h-4 mr-auto text-emerald-500" />}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl mb-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
              <UserCircle className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">{user?.full_name || user?.email}</p>
              <p className="text-[11px] text-slate-400 font-medium">{getRoleLabel(user?.role as UserRole)}</p>
            </div>
          </div>
          <button onClick={() => signOut()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-all duration-200">
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className={`sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-100 px-4 lg:px-6 py-3 transition-shadow duration-200 ${scrolled ? 'shadow-sm' : ''}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2.5 -mr-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0">
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">{pageTitles[currentPage] || 'الرئيسية'}</h1>
                <p className="text-[11px] text-slate-400 hidden sm:block">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors relative">
                <Bell className="w-5 h-5 text-slate-500" />
                <span className="absolute top-1.5 left-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              </button>
              <button onClick={() => onNavigate('profile')} className="p-1 hover:bg-slate-100 rounded-xl transition-colors">
                <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-emerald-700" />
                </div>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
