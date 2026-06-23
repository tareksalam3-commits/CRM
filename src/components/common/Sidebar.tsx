import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ROLE_LABELS, UserRole } from '../../types';
import { canAccessPage } from '../../lib/rbac';
import {
  LayoutDashboard, Users, UserCircle, FileText, Wallet, Target,
  CheckSquare, Bell, Calendar, BarChart3, ClipboardList, Settings,
  Moon, Sun, LogOut, Menu, X, Shield, GitBranch, Building2,
  ChevronDown, ChevronLeft
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { path: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
  { path: '/users', label: 'إدارة المستخدمين', icon: Users },
  { path: '/branches', label: 'إدارة الفروع', icon: Building2 },
  { path: '/branch-access', label: 'وصول الفروع', icon: Users },
  { path: '/org', label: 'الهيكل الوظيفي', icon: GitBranch },
  { path: '/clients', label: 'العملاء', icon: UserCircle },
  { path: '/policies', label: 'الوثائق', icon: FileText },
  { path: '/collections', label: 'التحصيل', icon: Wallet },
  { path: '/targets', label: 'التارجتات', icon: Target },
  { path: '/tasks', label: 'المهام', icon: CheckSquare },
  { path: '/notifications', label: 'الإشعارات', icon: Bell },
  { path: '/closing', label: 'تقفيل الشهر', icon: Calendar },
  { path: '/reports', label: 'التقارير', icon: BarChart3 },
  { path: '/audit', label: 'سجل العمليات', icon: ClipboardList },
  { path: '/settings', label: 'الإعدادات', icon: Settings },
];

export default function Sidebar() {
  const { profile, signOut, activeBranch, accessibleBranches, setActiveBranch } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  const userRole = profile?.role as UserRole | null;

  const filteredItems = navItems.filter(item => {
    if (!profile || !userRole) return false;
    return canAccessPage(userRole, item.path);
  });

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  async function handleBranchChange(branchId: string) {
    if (branchId === 'all') {
      await setActiveBranch({ id: 'all', name: 'جميع الفروع', code: 'ALL', is_active: true, created_at: '', updated_at: '' });
      setShowBranchMenu(false);
      return;
    }
    const branch = accessibleBranches.find(b => b.id === branchId);
    if (branch) {
      await setActiveBranch(branch);
      setShowBranchMenu(false);
    }
  }

  const isSuperAdmin = userRole === 'super_admin';
  const isDevManager = userRole === 'dev_manager';
  const showBranchSelector = accessibleBranches.length > 0;

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-crm border border-slate-200 dark:border-slate-700"
      >
        <Menu className="w-6 h-6 text-primary" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 transition-opacity" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 right-0 h-full w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 lg:static lg:z-auto overflow-hidden flex flex-col shadow-xl lg:shadow-none`}>
        {/* Header - Branding */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-crm-lg ring-4 ring-primary/10">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col">
                <h2 className="font-bold text-slate-900 dark:text-white text-base leading-tight">Insurance CRM</h2>
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Branch Management System</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Profile Section */}
        <div className="mx-4 my-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="text-primary font-bold text-lg">
                  {profile?.full_name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-success border-2 border-white dark:border-slate-800 rounded-full shadow-sm"></div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{profile?.full_name}</p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {userRole ? ROLE_LABELS[userRole] : 'بدون دور'}
              </p>
            </div>
          </div>
        </div>

        {/* Branch Selector */}
        {showBranchSelector && (
          <div className="px-4 pb-4 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowBranchMenu(!showBranchMenu)}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm group"
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <Building2 className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-bold truncate">{activeBranch?.name || 'اختر فرع'}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showBranchMenu ? 'rotate-180' : ''}`} />
              </button>

              {showBranchMenu && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-1.5">
                    {(isSuperAdmin || isDevManager) && (
                      <button
                        onClick={() => handleBranchChange('all')}
                        className={`w-full text-right px-3 py-2.5 text-xs rounded-lg transition-all mb-1 ${
                          activeBranch?.id === 'all'
                            ? 'bg-primary text-white font-bold shadow-crm'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        جميع الفروع
                      </button>
                    )}
                    {accessibleBranches.map(branch => (
                      <button
                        key={branch.id}
                        onClick={() => handleBranchChange(branch.id)}
                        className={`w-full text-right px-3 py-2.5 text-xs rounded-lg transition-all mb-1 last:mb-0 ${
                          activeBranch?.id === branch.id
                            ? 'bg-primary text-white font-bold shadow-crm'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {branch.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar pb-6">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">القائمة الرئيسية</span>
          </div>
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 group relative ${
                    isActive
                      ? 'bg-primary/5 dark:bg-primary/10 text-primary'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-primary dark:hover:text-primary-light'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={`w-5 h-5 flex-shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <div className="absolute right-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-l-full"></div>
                    )}
                    <ChevronLeft className={`w-4 h-4 transition-all duration-200 ${isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2 group-hover:opacity-40 group-hover:translate-x-0'}`} />
                  </>
                )}
              </NavLink>
            ))
          ) : (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-xs font-medium text-slate-400">لا توجد صفحات متاحة لصلاحياتك</p>
            </div>
          )}
        </nav>

        {/* Footer - Actions */}
        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 space-y-2 flex-shrink-0">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm hover:text-primary transition-all group"
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
            ) : (
              <Sun className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
            )}
            <span>{theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all group"
          >
            <LogOut className="w-5 h-5 text-red-400 group-hover:text-red-600 transition-colors" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
