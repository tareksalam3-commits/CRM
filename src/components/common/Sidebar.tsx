import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ROLE_LABELS, UserRole } from '../../types';
import { canAccessPage, getEffectiveRole } from '../../lib/rbac';
import {
  LayoutDashboard, Users, UserCircle, FileText, Wallet, Target,
  CheckSquare, Bell, Calendar, BarChart3, ClipboardList, Settings,
  Moon, Sun, LogOut, Menu, X, Shield, ChevronLeft, GitBranch, Building2,
  ChevronDown,
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
  const { profile, activeBranchAccess, signOut, activeBranch, accessibleBranches, setActiveBranch } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // ✅ الدور الفعّال: للمسؤولين العامين استخدام profile.role، وللآخرين استخدام دور الفرع النشط
  let userRole: UserRole | null = null;
  
  if (profile?.role === 'super_admin' || profile?.role === 'dev_manager') {
    // المسؤولون العامون يستخدمون دورهم من الملف الشخصي
    userRole = profile.role as UserRole;
  } else {
    // الأدوار الأخرى تستخدم الدور من صلاحيات الفرع النشط
    userRole = getEffectiveRole(activeBranchAccess);
  }

  // ✅ فلترة العناصر بناءً على الدور الفعال
  const filteredItems = navItems.filter(item => {
    if (!profile || !userRole) return false;
    return canAccessPage(userRole, item.path);
  });

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  async function handleBranchChange(branchId: string) {
    const branch = accessibleBranches.find(b => b.id === branchId);
    if (branch) {
      await setActiveBranch(branch);
      setShowBranchMenu(false);
    }
  }

  // ✅ إذا كان المستخدم super_admin أو dev_manager، لا نعرض selector الفروع
  const isSuperAdmin = userRole === 'super_admin';
  const isDevManager = userRole === 'dev_manager';
  const showBranchSelector = accessibleBranches.length > 0 && !isSuperAdmin && !isDevManager;

  return (
    <>
      {/* Mobile Toggle */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700"
      >
        <Menu className="w-6 h-6 text-slate-700 dark:text-slate-200" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setIsOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 right-0 h-full w-72 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 lg:static lg:z-auto overflow-y-auto flex flex-col`}>
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white text-sm">Insurance CRM</h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">Pro v2</span>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Profile Section */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/50 dark:to-blue-800/50 flex items-center justify-center shadow">
              <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                {profile?.full_name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{profile?.full_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {userRole ? ROLE_LABELS[userRole] : 'بدون دور'}
              </p>
            </div>
          </div>
        </div>

        {/* Branch Selector - فقط للمستخدمين غير الإداريين */}
        {showBranchSelector && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowBranchMenu(!showBranchMenu)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{activeBranch?.name || 'اختر فرع'}</span>
                </div>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showBranchMenu ? 'rotate-180' : ''}`} />
              </button>

              {showBranchMenu && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {accessibleBranches.map(branch => (
                    <button
                      key={branch.id}
                      onClick={() => handleBranchChange(branch.id)}
                      className={`w-full text-right px-3 py-2 text-sm transition-colors border-b border-slate-100 dark:border-slate-600 last:border-0 ${
                        activeBranch?.id === branch.id
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                <ChevronLeft className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
              </NavLink>
            ))
          ) : (
            <div className="text-center py-8 text-slate-400">
              <p className="text-sm">لا توجد صفحات متاحة</p>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-1 flex-shrink-0">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            <span>{theme === 'light' ? 'الوضع الداكن' : 'الوضع الفاتح'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
