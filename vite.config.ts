import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// FIX #V1: Removed lucide-react from optimizeDeps.exclude — was slowing dev server
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          charts:   ['recharts'],
          xlsx:     ['xlsx'],
          supabase: ['@supabase/supabase-js'],
          icons:    ['lucide-react'],
        },
      },
    },
  },
});
