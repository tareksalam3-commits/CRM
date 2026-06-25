import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  Building2,
  Network,
  Users2,
  FileText,
  CreditCard,
  Target,
  BarChart3,
  CalendarCheck,
  Bell,
  ClipboardList,
  History,
  Settings,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  LogOut,
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  roles?: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { name: 'لوحة التحكم', path: '/', icon: LayoutDashboard },
  { name: 'المستخدمين', path: '/users', icon: Users, roles: ['super_admin', 'development_manager'] },
  { name: 'الفروع', path: '/branches', icon: Building2, roles: ['super_admin', 'development_manager'] },
  { name: 'الهيكل التنظيمي', path: '/organization', icon: Network, roles: ['super_admin', 'development_manager', 'general_supervisor'] },
  { name: 'العملاء', path: '/clients', icon: Users2 },
  { name: 'الوثائق', path: '/policies', icon: FileText },
  { name: 'التحصيل', path: '/collections', icon: CreditCard },
  { name: 'الأهداف', path: '/targets', icon: Target },
  { name: 'التقارير', path: '/reports', icon: BarChart3 },
  { name: 'إغلاق الشهر', path: '/month-closing', icon: CalendarCheck, roles: ['super_admin', 'development_manager'] },
  { name: 'الإشعارات', path: '/notifications', icon: Bell },
  { name: 'المهام', path: '/tasks', icon: ClipboardList },
  { name: 'سجل العمليات', path: '/audit-log', icon: History, roles: ['super_admin'] },
  { name: 'الإعدادات', path: '/settings', icon: Settings, roles: ['super_admin'] },
];

export default function Sidebar() {
  const { profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpand = (path: string) => {
    setExpandedItems((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const filteredNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return profile && item.roles.includes(profile.role);
  });

  const renderNavItem = (item: NavItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.path);

    return (
      <div key={item.path}>
        {hasChildren ? (
          <button
            onClick={() => toggleExpand(item.path)}
            className={`w-full flex items-center justify-between px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ${
              depth > 0 ? 'pr-8' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <item.icon className="w-5 h-5" />
              {!collapsed && <span className="text-sm font-medium">{item.name}</span>}
            </div>
            {!collapsed && (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            )}
          </button>
        ) : (
          <NavLink
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ${
                isActive ? 'bg-blue-50 text-blue-600 font-medium' : ''
              } ${depth > 0 ? 'pr-8' : ''}`
            }
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="text-sm">{item.name}</span>}
          </NavLink>
        )}
        {hasChildren && isExpanded && !collapsed && (
          <div className="mt-1 space-y-1">
            {item.children!.map((child) => renderNavItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 right-4 z-50 p-2 rounded-lg bg-white shadow-lg lg:hidden"
      >
        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 right-0 h-full bg-white border-l border-gray-200 z-40 transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        } ${collapsed ? 'w-16' : 'w-64'}`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            {!collapsed && (
              <div>
                <h1 className="text-lg font-bold text-blue-600">نظام التأمين</h1>
                <p className="text-xs text-gray-500">إدارة المبيعات</p>
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="hidden lg:block p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {collapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            {filteredNavItems.map((item) => renderNavItem(item))}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-200">
            {!collapsed && profile && (
              <div className="mb-3">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {profile.full_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{profile.email}</p>
              </div>
            )}
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {!collapsed && <span>تسجيل الخروج</span>}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
