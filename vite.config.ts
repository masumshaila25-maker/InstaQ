
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // লোড এনভায়রনমেন্ট ভ্যারিয়েবল (Vercel-এর জন্য জরুরি)
  // Fix: Property 'cwd' does not exist on type 'Process'. Casting process to any to bypass type check in Vite config.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY || '')
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
