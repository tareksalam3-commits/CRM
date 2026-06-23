import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
  },
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
