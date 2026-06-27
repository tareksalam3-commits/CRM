import { useState, useEffect } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, FileText, Receipt, Target, BarChart3,
  Settings, LogOut, Menu, X, Shield, CalendarCheck, BookOpen,
  ChevronLeft, UserCircle, User, Bell, Search, ChevronRight,
  Home, Users2, FileCheck, TrendingUp, Clock, Sliders,
} from 'lucide-react';
import { getRoleLabel, type UserRole } from '../lib/supabase';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: Home, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'users', label: 'المستخدمين', icon: Users2, roles: ['super_admin', 'dev_manager', 'general_supervisor'] },
  { id: 'clients', label: 'العملاء', icon: UserCircle, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'policies', label: 'الوثائق', icon: FileCheck, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'collections', label: 'التحصيل', icon: Receipt, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'targets', label: 'التارجتات', icon: Target, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'reports', label: 'التقارير', icon: TrendingUp, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent'] },
  { id: 'monthly-closing', label: 'تقفيل الشهر', icon: CalendarCheck, roles: ['super_admin', 'dev_manager', 'general_supervisor'] },
  { id: 'activity-logs', label: 'سجل العمليات', icon: Clock, roles: ['super_admin', 'dev_manager', 'general_supervisor'] },
  { id: 'settings', label: 'الإعدادات', icon: Sliders, roles: ['super_admin', 'dev_manager'] },
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
        <div 
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-300" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 right-0 h-screen w-80 bg-gradient-to-b from-white via-white to-slate-50 border-l border-slate-200 z-50 flex flex-col transition-all duration-300 ease-out lg:translate-x-0 shadow-xl lg:shadow-none ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header Section */}
        <div className="relative p-6 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative w-14 h-14 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200/50 flex-shrink-0">
              <Shield className="w-7 h-7 text-white" strokeWidth={1.5} />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent" />
            </div>
            
            {/* Company Info */}
            <div className="flex-1 min-w-0">
              <h1 className="font-extrabold text-slate-900 text-lg leading-tight">تأمينات الحياة</h1>
              <p className="text-xs text-slate-500 font-medium mt-1">نظام إدارة العملاء</p>
            </div>
          </div>
          
          {/* Close button for mobile */}
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="absolute top-5 left-5 lg:hidden p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 active:scale-95"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const active = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 group relative ${
                  active 
                    ? 'bg-gradient-to-r from-emerald-50 to-emerald-50/50 text-emerald-900 shadow-md shadow-emerald-100/50 border border-emerald-200/50' 
                    : 'text-slate-700 hover:bg-slate-100/60 hover:text-slate-900 border border-transparent'
                }`}
              >
                {/* Icon */}
                <div className={`relative flex-shrink-0 transition-all duration-200 ${active ? 'text-emerald-600' : 'text-slate-500 group-hover:text-slate-700'}`}>
                  <Icon className="w-6 h-6" strokeWidth={1.5} />
                  {active && (
                    <div className="absolute inset-0 bg-emerald-600/10 rounded-lg blur-md" />
                  )}
                </div>
                
                {/* Label */}
                <span className="flex-1 text-right">{item.label}</span>
                
                {/* Active indicator */}
                {active && (
                  <ChevronLeft className="w-5 h-5 text-emerald-600 flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="px-4 py-3">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        </div>

        {/* User Card Section */}
        <div className="p-4 space-y-3">
          {/* User Info Card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-slate-50 border border-slate-200/60 p-4 shadow-sm hover:shadow-md transition-all duration-300">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-slate-300/5 rounded-full -ml-8 -mb-8" />
            
            {/* Content */}
            <div className="relative flex items-center gap-3">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200/50">
                  <UserCircle className="w-6 h-6 text-white" strokeWidth={1.5} />
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
              </div>
              
              {/* User Details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{user?.full_name || user?.email}</p>
                <p className="text-xs text-slate-600 font-medium mt-0.5">{getRoleLabel(user?.role as UserRole)}</p>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button 
            onClick={() => signOut()} 
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/50 transition-all duration-200 active:scale-95 shadow-sm hover:shadow-md"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className={`sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 lg:px-6 py-4 transition-all duration-200 ${scrolled ? 'shadow-md shadow-slate-200/30' : 'shadow-none'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button 
                onClick={() => setSidebarOpen(true)} 
                className="lg:hidden p-2.5 -mr-2 hover:bg-slate-100 rounded-xl transition-all duration-200 active:scale-95 shrink-0"
              >
                <Menu className="w-6 h-6 text-slate-700" strokeWidth={1.5} />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">{pageTitles[currentPage] || 'الرئيسية'}</h1>
                <p className="text-xs text-slate-500 hidden sm:block font-medium">{new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button className="p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 active:scale-95 relative">
                <Bell className="w-5 h-5 text-slate-600" strokeWidth={1.5} />
                <span className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white shadow-sm" />
              </button>
              <button 
                onClick={() => onNavigate('profile')} 
                className="p-1 hover:bg-slate-100 rounded-xl transition-all duration-200 active:scale-95"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-200/50">
                  <UserCircle className="w-5 h-5 text-white" strokeWidth={1.5} />
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
