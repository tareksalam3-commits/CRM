import { AlertCircle, X } from 'lucide-react';

interface ErrorDisplayProps {
  error: string | null;
  onDismiss?: () => void;
  type?: 'error' | 'warning' | 'info';
}

export default function ErrorDisplay({ error, onDismiss, type = 'error' }: ErrorDisplayProps) {
  if (!error) return null;

  const bgColor = {
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  }[type];

  const textColor = {
    error: 'text-red-700 dark:text-red-400',
    warning: 'text-yellow-700 dark:text-yellow-400',
    info: 'text-blue-700 dark:text-blue-400',
  }[type];

  const iconColor = {
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400',
  }[type];

  return (
    <div className={`p-4 rounded-lg border ${bgColor} flex items-start gap-3`}>
      <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1">
        <p className={`text-sm ${textColor}`}>{error}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`flex-shrink-0 ${textColor} hover:opacity-70`}
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
