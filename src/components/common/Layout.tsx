import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex" dir="rtl">
      <Sidebar />
      <main className="flex-1 lg:pr-0 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 pt-16 lg:pt-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
