import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// FIX #S1: Clear error when env vars missing — not silent broken client
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[CRM] ⛔ متغيرات Supabase مفقودة!\n' +
    'أنشئ ملف .env:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  );
  if (typeof document !== 'undefined' && import.meta.env.PROD) {
    document.body.innerHTML =
      '<div style="font-family:sans-serif;padding:2rem;direction:rtl;text-align:center">' +
      '<h2 style="color:#dc2626">⛔ خطأ في إعداد التطبيق</h2>' +
      '<p>يرجى التواصل مع المطور</p></div>';
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
// force update Thu Jun 18 21:05:06 UTC 2026
