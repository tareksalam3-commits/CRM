import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ROLE_LABELS, UserRole } from '../../types';
import {
  LayoutDashboard, Users, UserCircle, FileText, Wallet, Target,
  CheckSquare, Bell, Calendar, BarChart3, ClipboardList, Settings,
  Moon, Sun, LogOut, Menu, X, Shield, ChevronLeft, GitBranch,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles?: UserRole[];
}

const navItems: NavItem[] = [
  { path: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
  { path: '/users', label: 'المستخدمين', icon: Users, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'] },
  { path: '/org', label: 'الهيكل الوظيفي', icon: GitBranch, roles: ['super_admin', 'dev_manager', 'general_supervisor', 'supervisor', 'team_leader'] },
  { path: '/clients', label: 'العملاء', icon: UserCircle },
  { path: '/policies', label: 'الوثائق', icon: FileText },
  { path: '/collections', label: 'التحصيل', icon: Wallet },
  { path: '/targets', label: 'التارجتات', icon: Target },
  { path: '/tasks', label: 'المهام', icon: CheckSquare },
  { path: '/notifications', label: 'الإشعارات', icon: Bell },
  { path: '/closing', label: 'تقفيل الشهر', icon: Calendar, roles: ['super_admin', 'dev_manager'] },
  { path: '/reports', label: 'التقارير', icon: BarChart3 },
  { path: '/audit', label: 'سجل العمليات', icon: ClipboardList, roles: ['super_admin', 'dev_manager'] },
  { path: '/settings', label: 'الإعدادات', icon: Settings, roles: ['super_admin'] },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const filteredItems = navItems.filter(item => {
    if (!item.roles) return true;
    return profile && item.roles.includes(profile.role);
  });

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

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
      <aside className={`fixed top-0 right-0 h-full w-72 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 lg:static lg:z-auto overflow-y-auto`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
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

          {/* Profile */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                  {profile?.full_name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{profile?.full_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{profile ? ROLE_LABELS[profile.role as UserRole] : ''}</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {filteredItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                <ChevronLeft className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-1">
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
        </div>
      </aside>
    </>
  );
}
