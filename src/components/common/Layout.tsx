import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="min-h-screen bg-background dark:bg-slate-950 flex font-sans" dir="rtl">
      {/* Sidebar Navigation */}
      <Sidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 min-h-screen transition-all duration-300 ease-in-out">
        {/* Top Header Placeholder (if needed for mobile) */}
        <div className="lg:hidden h-16 w-full"></div>
        
        {/* Content Wrapper */}
        <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in duration-700">
          <Outlet />
        </div>
        
        {/* Footer Info */}
        <footer className="px-4 md:px-10 py-8 border-t border-slate-100 dark:border-slate-900 mt-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
              Insurance CRM System &copy; 2026
            </p>
            <div className="flex items-center gap-6">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Branch Management</span>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sales Analysis</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
