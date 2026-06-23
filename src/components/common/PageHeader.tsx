import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8 animate-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-5">
        {Icon && (
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/10 shadow-sm group">
            <Icon className="w-7 h-7 text-primary transition-transform group-hover:scale-110 duration-300" />
          </div>
        )}
        <div className="flex flex-col">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-2">
            {title}
          </h1>
          {(subtitle || description) && (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
              <p className="text-sm font-bold text-slate-400 dark:text-slate-500 tracking-wide uppercase">
                {subtitle || description}
              </p>
            </div>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-crm border border-slate-100 dark:border-slate-800">
          {actions}
        </div>
      )}
    </div>
  );
}
