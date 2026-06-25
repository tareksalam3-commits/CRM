import { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export default function StatsCard({ title, value, icon, trend, variant = 'default' }: StatsCardProps) {
  const variants = {
    default: 'bg-white',
    primary: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white',
    success: 'bg-gradient-to-br from-green-500 to-green-600 text-white',
    warning: 'bg-gradient-to-br from-yellow-500 to-yellow-600 text-white',
    danger: 'bg-gradient-to-br from-red-500 to-red-600 text-white',
  };

  const iconBgVariants = {
    default: 'bg-blue-100 text-blue-600',
    primary: 'bg-white/20 text-white',
    success: 'bg-white/20 text-white',
    warning: 'bg-white/20 text-white',
    danger: 'bg-white/20 text-white',
  };

  return (
    <div className={`${variants[variant]} rounded-xl shadow-sm p-5 border border-gray-100`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className={`text-sm font-medium ${variant === 'default' ? 'text-gray-600' : 'text-white/80'}`}>
            {title}
          </p>
          <p className={`text-2xl font-bold mt-1 ${variant === 'default' ? 'text-gray-900' : 'text-white'}`}>
            {value}
          </p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.isPositive ? (
                <TrendingUp className={`w-4 h-4 ${variant === 'default' ? 'text-green-600' : 'text-white/80'}`} />
              ) : (
                <TrendingDown className={`w-4 h-4 ${variant === 'default' ? 'text-red-600' : 'text-white/80'}`} />
              )}
              <span className={`text-sm font-medium ${variant === 'default' ? 'text-gray-600' : 'text-white/80'}`}>
                {trend.value}% من الشهر الماضي
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${iconBgVariants[variant]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
